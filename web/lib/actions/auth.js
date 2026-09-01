"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";
import { caminhoInterno } from "@/lib/caminho-interno";

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

  redirect("/");
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

  const { error: erroUsuarios } = await supabase.from("Usuarios").insert({
    id_user: data.user.id,
    nome,
    email,
    contato: Number(String(contato).replace(/\D/g, "")),
    crp: crp || null,
    role: "psicologo",
    aprovado: false,
  });

  if (erroUsuarios) {
    return { error: "Conta criada, mas não foi possível salvar seus dados. Avise o suporte." };
  }

  // Melhor esforço: se falhar, o profissional ainda consegue carregar a
  // lista padrão depois pelo botão em /financeiro/classificacoes.
  await criarClassificacoesPadrao(supabase, data.user.id).catch(() => {});

  redirect(origem === "busca" ? "/diretorio" : "/");
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

  redirect("/");
}

export async function entrarComGoogle(origem) {
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = origem === "busca" ? "/diretorio" : "/";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data?.url) {
    redirect(origem === "busca" ? "/cadastro?origem=busca&erro=google" : "/login?erro=google");
  }

  redirect(data.url);
}

export async function completarPerfilGoogle(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nome = formData.get("nome");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
  const next = caminhoInterno(formData.get("next"));

  const { error } = await supabase.from("Usuarios").insert({
    id_user: user.id,
    nome,
    email: user.email,
    contato: Number(String(contato).replace(/\D/g, "")),
    crp: crp || null,
    role: "psicologo",
    aprovado: false,
  });

  if (error) {
    return { error: "Não foi possível salvar seu cadastro. Tente novamente." };
  }

  await criarClassificacoesPadrao(supabase, user.id).catch(() => {});

  redirect(next);
}
