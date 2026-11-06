"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";
import { podeReceberTeste, calcularFimTeste, PLANOS_LIBERAVEIS } from "@/lib/teste-plano";

export async function convidarProfissional(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autorizado." };
  }

  const { data: usuarioAtual, error: erroUsuarioAtual } = await supabase
    .from("Usuarios")
    .select("role")
    .eq("id_user", user.id)
    .single();

  if (erroUsuarioAtual || usuarioAtual?.role !== "admin") {
    return { error: "Não autorizado." };
  }

  const nome = formData.get("nome");
  const email = formData.get("email");
  const contato = formData.get("contato");
  const crp = formData.get("crp");

  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = createAdminClient();

  const { data: convite, error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origem}/auth/callback?next=/redefinir-senha`,
  });

  if (erroConvite) {
    if (erroConvite.message?.toLowerCase().includes("already")) {
      return { error: "Este e-mail já está cadastrado." };
    }
    return { error: "Não foi possível enviar o convite." };
  }

  const { error: erroUsuarios } = await admin.from("Usuarios").insert({
    id_user: convite.user.id,
    nome,
    email,
    contato: Number(String(contato).replace(/\D/g, "")),
    crp: crp || null,
    role: "psicologo",
    aprovado: true,
  });

  if (erroUsuarios) {
    return { error: "Convite enviado, mas não foi possível criar o cadastro. Avise o suporte." };
  }

  // Melhor esforço: se falhar, o profissional ainda consegue carregar a
  // lista padrão depois pelo botão em /financeiro/classificacoes.
  await criarClassificacoesPadrao(admin, convite.user.id).catch(() => {});

  revalidatePath("/admin/profissionais");
  return { mensagem: `Convite enviado para ${email}.` };
}

export async function aprovarProfissional(id) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autorizado.");
  }

  const { data: usuarioAtual, error: erroUsuarioAtual } = await supabase
    .from("Usuarios")
    .select("role")
    .eq("id_user", user.id)
    .single();

  if (erroUsuarioAtual || usuarioAtual?.role !== "admin") {
    throw new Error("Não autorizado.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("Usuarios").update({ aprovado: true }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}

export async function alternarCriadorConteudo(id, valorAtual) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autorizado.");
  }

  const { data: usuarioAtual, error: erroUsuarioAtual } = await supabase
    .from("Usuarios")
    .select("role")
    .eq("id_user", user.id)
    .single();

  if (erroUsuarioAtual || usuarioAtual?.role !== "admin") {
    throw new Error("Não autorizado.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("Usuarios")
    .update({ criador_conteudo: !valorAtual })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}

export async function alterarPlano(id, novoPlano) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autorizado.");
  }

  const { data: usuarioAtual, error: erroUsuarioAtual } = await supabase
    .from("Usuarios")
    .select("role")
    .eq("id_user", user.id)
    .single();

  if (erroUsuarioAtual || usuarioAtual?.role !== "admin") {
    throw new Error("Não autorizado.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("Usuarios")
    .update({
      plano: novoPlano,
      // Atribuição manual sobrepõe o teste; as três colunas saem juntas.
      teste_plano: null,
      teste_expira_em: null,
      teste_aviso_enviado_em: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}

async function exigirAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autorizado.");
  const { data: usuarioAtual, error } = await supabase
    .from("Usuarios")
    .select("role")
    .eq("id_user", user.id)
    .single();
  if (error || usuarioAtual?.role !== "admin") throw new Error("Não autorizado.");
}

export async function marcarCrpConferido(id) {
  await exigirAdmin();
  const { error } = await createAdminClient().from("Usuarios").update({ crp_conferido: true }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/profissionais");
}

function validarDias(dias) {
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) {
    throw new Error("Informe uma duração entre 1 e 90 dias.");
  }
}

async function buscarAlvoTeste(admin, id) {
  const { data, error } = await admin
    .from("Usuarios")
    .select("id, role, plano, plano_pretendido, plano_pago, teste_plano, teste_expira_em")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Profissional não encontrado.");
  return data;
}

async function registrarEventoTeste(admin, usuarioId, tipo, payload) {
  const { error } = await admin.from("EventoAssinatura").insert({
    usuario: usuarioId,
    asaas_event_id: `${tipo}-${usuarioId}-${new Date().toISOString()}`,
    tipo,
    payload,
  });
  if (error) throw new Error(error.message);
}

export async function liberarTestePlano(id, plano, dias) {
  await exigirAdmin();
  if (!PLANOS_LIBERAVEIS.includes(plano)) {
    throw new Error("Plano inválido para teste.");
  }
  dias = Number(dias);
  validarDias(dias);

  const admin = createAdminClient();
  const alvo = await buscarAlvoTeste(admin, id);
  if (alvo.role === "admin" || !podeReceberTeste(alvo)) {
    throw new Error("Este profissional não pode receber teste de plano: ele precisa estar no plano Grátis, sem assinatura paga pendente ou em atraso.");
  }

  const expiraEm = calcularFimTeste(new Date(), dias);
  const { error } = await admin
    .from("Usuarios")
    .update({
      plano,
      teste_plano: plano,
      teste_expira_em: expiraEm.toISOString(),
      teste_aviso_enviado_em: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEventoTeste(admin, id, "teste_liberado", {
    plano,
    dias,
    expira_em: expiraEm.toISOString(),
  });
  revalidatePath("/admin/profissionais");
}

export async function encerrarTestePlano(id) {
  await exigirAdmin();
  const admin = createAdminClient();
  const alvo = await buscarAlvoTeste(admin, id);
  if (!alvo.teste_plano) {
    throw new Error("Este profissional não está em teste.");
  }

  const { error } = await admin
    .from("Usuarios")
    .update({
      plano: "gratis",
      teste_plano: null,
      teste_expira_em: null,
      teste_aviso_enviado_em: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEventoTeste(admin, id, "teste_encerrado", {
    plano: alvo.teste_plano,
    motivo: "admin",
  });
  revalidatePath("/admin/profissionais");
}

export async function estenderTestePlano(id, dias) {
  await exigirAdmin();
  dias = Number(dias);
  validarDias(dias);

  const admin = createAdminClient();
  const alvo = await buscarAlvoTeste(admin, id);
  if (!alvo.teste_plano || !alvo.teste_expira_em) {
    throw new Error("Este profissional não está em teste.");
  }

  const expiraEm = calcularFimTeste(new Date(), dias, new Date(alvo.teste_expira_em));
  const { error } = await admin
    .from("Usuarios")
    .update({
      teste_expira_em: expiraEm.toISOString(),
      teste_aviso_enviado_em: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEventoTeste(admin, id, "teste_estendido", {
    plano: alvo.teste_plano,
    dias,
    expira_em: expiraEm.toISOString(),
  });
  revalidatePath("/admin/profissionais");
}

// Tira o perfil do diretório (aprovado = false) e reabre a conferência.
export async function revogarAprovacao(id) {
  await exigirAdmin();
  const { error } = await createAdminClient()
    .from("Usuarios")
    .update({ aprovado: false, crp_conferido: false })
    .eq("id", id)
    .neq("role", "admin");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/profissionais");
}
