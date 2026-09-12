"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";
import { enviarEmailResend, EMAIL_ADMIN } from "@/lib/email/resend";

export async function entrar(prevState, formData) {
  const email = formData.get("email");
  const senha = formData.get("senha");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return { error: "E-mail ou senha inválidos" };
  }

  redirect("/painel");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function enviarRecuperacaoSenha(prevState, formData) {
  const email = formData.get("email");
  const supabase = await createClient();

  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origem}/auth/callback?next=/redefinir-senha`,
  });

  if (error) {
    return { error: "Não foi possível enviar o e-mail de recuperação." };
  }

  return { mensagem: "Se o e-mail existir, você vai receber um link de recuperação." };
}

export async function cadastrar(prevState, formData) {
  const nome = formData.get("nome");
  const email = formData.get("email");
  const senha = formData.get("senha");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
  const origem = formData.get("origem");

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
  });

  if (error) {
    if (error.message?.toLowerCase().includes("already")) {
      return { error: "Este e-mail já está cadastrado." };
    }
    return { error: "Não foi possível criar a conta." };
  }

  const cookieStore = await cookies();
  const sessaoVisitante = cookieStore.get("pv_id")?.value ?? null;

  const { data: usuarioInserido, error: erroUsuarios } = await supabase
    .from("Usuarios")
    .insert({
      id_user: data.user.id,
      nome,
      email,
      contato: Number(String(contato).replace(/\D/g, "")),
      crp: crp || null,
      role: "psicologo",
      aprovado: false,
      visitante_sessao_id: sessaoVisitante,
    })
    .select("id")
    .single();

  if (erroUsuarios) {
    return { error: "Conta criada, mas não foi possível salvar seus dados. Avise o suporte." };
  }

  // Melhor esforço: se falhar, o profissional ainda consegue carregar a
  // lista padrão depois pelo botão em /financeiro/classificacoes.
  await criarClassificacoesPadrao(supabase, data.user.id).catch(() => {});

  // Melhor esforço: RLS do CRM só permite escrita por admin, então o
  // insert automático roda com service-role (o profissional recém-criado
  // não é admin e não teria como criar essa linha pela própria sessão).
  createAdminClient()
    .from("Lead")
    .insert({
      nome,
      telefone: String(contato),
      email,
      usuario_id: usuarioInserido.id,
      visitante_sessao_id: sessaoVisitante,
      estagio: "novo",
      origem: "cadastro",
    })
    .catch(() => {});

  // Melhor esforço: notificação pro ADM nunca bloqueia o cadastro do
  // profissional, mesmo se o Resend estiver fora do ar.
  enviarEmailResend({
    to: EMAIL_ADMIN,
    subject: `Novo cadastro: ${nome}`,
    html: `<p>Novo profissional cadastrado no PsiAgente.</p>
      <p><strong>Nome:</strong> ${nome}</p>
      <p><strong>E-mail:</strong> ${email}</p>
      <p><strong>Contato:</strong> ${contato}</p>
      <p><strong>CRP:</strong> ${crp || "não informado"}</p>
      <p><strong>Origem:</strong> ${origem || "direto"}</p>`,
  }).catch(() => {});

  redirect(origem === "busca" ? "/diretorio" : "/painel");
}

export async function atualizarSenha(prevState, formData) {
  const novaSenha = formData.get("senha");
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: novaSenha });

  if (error) {
    if (error.code === "same_password") {
      return { error: "A nova senha precisa ser diferente da senha atual." };
    }
    return { error: "Não foi possível atualizar a senha." };
  }

  redirect("/painel");
}
