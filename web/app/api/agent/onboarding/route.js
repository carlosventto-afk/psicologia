import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function checarLimiteTentativas(admin, whatsappNumber) {
  const { data: sessaoAtual } = await admin
    .from("agent_sessions")
    .select("tentativas_cadastro, tentativas_cadastro_desde")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  const agora = new Date();
  const janelaAtiva =
    sessaoAtual?.tentativas_cadastro_desde &&
    agora.getTime() - new Date(sessaoAtual.tentativas_cadastro_desde).getTime() < 24 * 60 * 60 * 1000;

  const tentativas = janelaAtiva ? (sessaoAtual.tentativas_cadastro ?? 0) + 1 : 1;
  const desde = janelaAtiva ? sessaoAtual.tentativas_cadastro_desde : agora.toISOString();

  if (tentativas > 3) {
    return { bloqueado: true };
  }

  const { error: erroUpsertTentativas } = await admin
    .from("agent_sessions")
    .upsert(
      { whatsapp_number: whatsappNumber, tentativas_cadastro: tentativas, tentativas_cadastro_desde: desde },
      { onConflict: "whatsapp_number" }
    );

  if (erroUpsertTentativas) {
    console.error("Falha ao gravar tentativas_cadastro em agent_sessions:", erroUpsertTentativas.message);
  }

  return { bloqueado: false };
}

async function enviarLinkMagico(email) {
  const anon = createAnonClient();
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${ORIGIN}/auth/callback?next=/`, shouldCreateUser: false },
  });
  return { error };
}

async function criarConta(admin, { whatsapp_number, nome, email }) {
  if (!nome || !email) {
    return Response.json({ success: false, error_code: "DADOS_INCOMPLETOS" }, { status: 400 });
  }

  // Idempotência: se esse whatsapp_number já tem um profissional vinculado,
  // não tenta criar uma segunda conta (o que criaria um segundo Auth user e
  // esbarraria numa constraint única de Usuarios.whatsapp_number/contato) --
  // apenas reencaminha pro fluxo de "conta existente" e reenvia o link.
  const { data: usuarioMesmoNumero } = await admin
    .from("Usuarios")
    .select("id, email")
    .eq("whatsapp_number", whatsapp_number)
    .maybeSingle();

  if (usuarioMesmoNumero) {
    const { error: erroUpsertSessao } = await admin.from("agent_sessions").upsert(
      { whatsapp_number, usuario_id: usuarioMesmoNumero.id, link_confirmacao_pendente: true },
      { onConflict: "whatsapp_number" }
    );
    if (erroUpsertSessao) {
      console.error("Falha ao atualizar agent_sessions (WHATSAPP_JA_CADASTRADO):", erroUpsertSessao.message);
    }

    const { error: erroLinkExistente } = await enviarLinkMagico(usuarioMesmoNumero.email);
    if (erroLinkExistente) {
      console.error("Falha ao enviar link mágico (WHATSAPP_JA_CADASTRADO):", erroLinkExistente.message);
    }

    return Response.json({ success: false, error_code: "WHATSAPP_JA_CADASTRADO" }, { status: 200 });
  }

  const { bloqueado } = await checarLimiteTentativas(admin, whatsapp_number);
  if (bloqueado) {
    return Response.json({ success: false, error_code: "LIMITE_TENTATIVAS_CADASTRO" }, { status: 200 });
  }

  const senhaAleatoria = randomBytes(24).toString("hex");
  const { data: criado, error: erroCreate } = await admin.auth.admin.createUser({
    email,
    password: senhaAleatoria,
    email_confirm: true,
  });

  if (erroCreate) {
    if (erroCreate.message?.toLowerCase().includes("already")) {
      const { data: usuarioExistente } = await admin
        .from("Usuarios")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (usuarioExistente) {
        const { error: erroUpsertSessao } = await admin.from("agent_sessions").upsert(
          {
            whatsapp_number,
            usuario_id: usuarioExistente.id,
            onboarding_etapa: "concluido",
            link_confirmacao_pendente: true,
          },
          { onConflict: "whatsapp_number" }
        );
        if (erroUpsertSessao) {
          console.error("Falha ao atualizar agent_sessions (EMAIL_JA_CADASTRADO):", erroUpsertSessao.message);
        }

        const { error: erroLink } = await enviarLinkMagico(email);
        if (erroLink) {
          console.error("Falha ao enviar link mágico (EMAIL_JA_CADASTRADO):", erroLink.message);
        }
      }

      return Response.json({ success: false, error_code: "EMAIL_JA_CADASTRADO" }, { status: 200 });
    }

    return Response.json({ success: false, error_code: "ERRO_CRIAR_CONTA" }, { status: 200 });
  }

  const contatoDigitos = Number(String(whatsapp_number).replace(/\D/g, ""));

  const { data: novoUsuario, error: erroUsuarios } = await admin
    .from("Usuarios")
    .insert({
      id_user: criado.user.id,
      nome,
      email,
      contato: contatoDigitos,
      crp: null,
      role: "psicologo",
      aprovado: false,
      whatsapp_number,
      whatsapp_verified: false,
    })
    .select("id")
    .single();

  if (erroUsuarios) {
    // Rollback best-effort: sem isso, o Auth user fica órfão -- uma
    // tentativa futura de criar_conta com esse e-mail cai no ramo "already"
    // sem achar linha correspondente em Usuarios, e o profissional fica sem
    // caminho de recuperação.
    await admin.auth.admin.deleteUser(criado.user.id).catch(() => {});
    return Response.json({ success: false, error_code: "ERRO_CRIAR_CONTA" }, { status: 200 });
  }

  await criarClassificacoesPadrao(admin, criado.user.id).catch(() => {});

  const { error: erroUpsertSessao } = await admin.from("agent_sessions").upsert(
    {
      whatsapp_number,
      usuario_id: novoUsuario.id,
      onboarding_etapa: "aguardando_confirmacao_email",
      link_confirmacao_pendente: true,
    },
    { onConflict: "whatsapp_number" }
  );
  if (erroUpsertSessao) {
    console.error("Falha ao atualizar agent_sessions (criar_conta):", erroUpsertSessao.message);
  }

  const { error: erroLink } = await enviarLinkMagico(email);
  if (erroLink) {
    console.error("Falha ao enviar link mágico (criar_conta):", erroLink.message);
    return Response.json({ success: false, error_code: "ERRO_ENVIAR_LINK" }, { status: 200 });
  }

  return Response.json({ success: true });
}

async function reenviarOuRevalidar(admin, { whatsapp_number }) {
  const { data: sessao } = await admin
    .from("agent_sessions")
    .select("usuario_id")
    .eq("whatsapp_number", whatsapp_number)
    .maybeSingle();

  if (!sessao?.usuario_id) {
    return Response.json({ success: false, error_code: "WHATSAPP_NAO_VINCULADO" }, { status: 200 });
  }

  const { data: usuario } = await admin
    .from("Usuarios")
    .select("email")
    .eq("id", sessao.usuario_id)
    .maybeSingle();

  if (!usuario?.email) {
    return Response.json({ success: false, error_code: "WHATSAPP_NAO_VINCULADO" }, { status: 200 });
  }

  const { error: erroUpdateSessao } = await admin
    .from("agent_sessions")
    .update({ link_confirmacao_pendente: true })
    .eq("whatsapp_number", whatsapp_number);
  if (erroUpdateSessao) {
    console.error("Falha ao atualizar agent_sessions (reenviar_link/revalidar):", erroUpdateSessao.message);
  }

  const { error: erroLink } = await enviarLinkMagico(usuario.email);
  if (erroLink) {
    console.error("Falha ao enviar link mágico (reenviar_link/revalidar):", erroLink.message);
    return Response.json({ success: false, error_code: "ERRO_ENVIAR_LINK" }, { status: 200 });
  }

  return Response.json({ success: true });
}

export async function POST(request) {
  const segredo = request.headers.get("x-agent-secret");
  if (!segredo || segredo !== process.env.AGENT_TOOL_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { acao, whatsapp_number } = body;

  if (!whatsapp_number) {
    return Response.json({ success: false, error_code: "WHATSAPP_NUMBER_AUSENTE" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (acao === "criar_conta") {
    return criarConta(admin, body);
  }

  if (acao === "reenviar_link" || acao === "revalidar") {
    return reenviarOuRevalidar(admin, body);
  }

  return Response.json({ success: false, error_code: "ACAO_DESCONHECIDA" }, { status: 400 });
}
