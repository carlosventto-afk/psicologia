import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";
import { enviarEmailResend } from "@/lib/email/resend";

// FRONTEIRA DE CONFIANÇA -- whatsapp_number no corpo desta rota é confiado
// cegamente, sem nenhuma prova de posse do número nesta camada HTTP. Quem
// chamar essa rota (hoje ninguém; no futuro, o workflow n8n ainda não
// construído) É OBRIGADO a preencher whatsapp_number a partir de uma fonte
// verificada -- o JID/remetente da própria Evolution API, normalizado --
// e NUNCA a partir de um parâmetro de tool que uma LLM ou o usuário final
// possam preencher livremente. Se isso for violado, qualquer pessoa que
// souber (ou adivinhar) o número de outro profissional consegue criar
// conta, reenviar magic link ou revalidar em nome dele.
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

// Gera o link mágico via Auth Admin API (nunca tenta mandar e-mail
// sozinho) e manda o e-mail nós mesmos pela API do Resend -- contorna o
// relay SMTP interno do Supabase Auth, que ficou instável (ver
// web/lib/email/resend.js pro porquê).
//
// NÃO usar data.properties.action_link: é o link bruto do GoTrue
// (/auth/v1/verify), que ao ser clicado redireciona pra nossa URL com o
// token no FRAGMENTO (#access_token=...) -- fluxo implícito, não PKCE,
// porque não existe sessão de navegador nenhuma na hora de gerar o link
// admin-side. Fragmento nunca chega ao servidor, então nenhuma rota
// server-side (nem /auth/callback nem /auth/confirm) consegue lê-lo.
// Confirmado ao vivo (2026-09-08): generateLink também devolve
// hashed_token, que /auth/confirm já sabe processar via verifyOtp
// inteiramente no servidor, sem fragmento nenhum -- por isso montamos o
// link nós mesmos apontando pra lá.
async function enviarLinkMagico(admin, email) {
  const { data, error: erroGerarLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (erroGerarLink) {
    return { error: erroGerarLink };
  }

  const link = `${ORIGIN}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`;

  return enviarEmailResend({
    to: email,
    subject: "Seu link de acesso ao PsiAgente",
    html: `<p>Clique no link abaixo para continuar:</p><p><a href="${link}">${link}</a></p><p>Se você não pediu isso, pode ignorar este e-mail.</p>`,
  });
}

async function criarConta(admin, { whatsapp_number, nome, email }) {
  if (!nome || !email) {
    return Response.json({ success: false, error_code: "DADOS_INCOMPLETOS" }, { status: 400 });
  }

  // Normaliza uma vez e usa em todo lugar daqui pra frente -- sem isso,
  // "Foo@Example.com" e "foo@example.com" driftam entre o check "already
  // registered" do Auth (que o Supabase normaliza internamente) e o
  // .eq("email", email) case-sensitive contra Usuarios, produzindo
  // EMAIL_JA_CADASTRADO falso (ou falso negativo) sem jeito de achar a
  // conta de verdade.
  const emailNormalizado = email.trim().toLowerCase();

  // Rate limit primeiro, antes de qualquer outro caminho de retorno --
  // inclusive o de "já cadastrado" logo abaixo, senão uma conta já
  // existente vira um jeito de reenviar magic link sem limite (nenhum dos
  // três desfechos -- WHATSAPP_JA_CADASTRADO, EMAIL_JA_CADASTRADO, sucesso
  // -- pode pular esse gate).
  const { bloqueado } = await checarLimiteTentativas(admin, whatsapp_number);
  if (bloqueado) {
    return Response.json({ success: false, error_code: "LIMITE_TENTATIVAS_CADASTRO" }, { status: 200 });
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

    const { error: erroLinkExistente } = await enviarLinkMagico(admin, usuarioMesmoNumero.email);
    if (erroLinkExistente) {
      console.error("Falha ao enviar link mágico (WHATSAPP_JA_CADASTRADO):", erroLinkExistente.message);
      return Response.json({ success: false, error_code: "ERRO_ENVIAR_LINK" }, { status: 200 });
    }

    return Response.json({ success: false, error_code: "WHATSAPP_JA_CADASTRADO" }, { status: 200 });
  }

  const senhaAleatoria = randomBytes(24).toString("hex");
  const { data: criado, error: erroCreate } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    password: senhaAleatoria,
    email_confirm: true,
  });

  if (erroCreate) {
    if (erroCreate.message?.toLowerCase().includes("already")) {
      const { data: usuarioExistente } = await admin
        .from("Usuarios")
        .select("id")
        .eq("email", emailNormalizado)
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

        const { error: erroLink } = await enviarLinkMagico(admin, emailNormalizado);
        if (erroLink) {
          console.error("Falha ao enviar link mágico (EMAIL_JA_CADASTRADO):", erroLink.message);
          return Response.json({ success: false, error_code: "ERRO_ENVIAR_LINK" }, { status: 200 });
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
      email: emailNormalizado,
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

  const { error: erroLink } = await enviarLinkMagico(admin, emailNormalizado);
  if (erroLink) {
    console.error("Falha ao enviar link mágico (criar_conta):", erroLink.message);
    return Response.json({ success: false, error_code: "ERRO_ENVIAR_LINK" }, { status: 200 });
  }

  return Response.json({ success: true });
}

async function reenviarOuRevalidar(admin, { whatsapp_number }) {
  // Mesmo rate limiter/janela de criar_conta -- sem isso, reenviar_link e
  // revalidar seriam um jeito de mandar magic link ilimitado pra qualquer
  // numero que ja tenha linha em agent_sessions.
  const { bloqueado } = await checarLimiteTentativas(admin, whatsapp_number);
  if (bloqueado) {
    return Response.json({ success: false, error_code: "LIMITE_TENTATIVAS_CADASTRO" }, { status: 200 });
  }

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

  const { error: erroLink } = await enviarLinkMagico(admin, usuario.email);
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
