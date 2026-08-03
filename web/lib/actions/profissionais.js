"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  revalidatePath("/admin/profissionais");
  return { mensagem: `Convite enviado para ${email}.` };
}

export async function aprovarProfissional(id) {
  const supabase = await createClient();

  const { error } = await supabase.from("Usuarios").update({ aprovado: true }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}
