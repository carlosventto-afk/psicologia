"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function atualizarSenha(prevState, formData) {
  const novaSenha = formData.get("senha");
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: novaSenha });

  if (error) {
    return { error: "Não foi possível atualizar a senha." };
  }

  redirect("/");
}
