"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function atualizarMeusDados(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contatoBruto = formData.get("contato");

  const dados = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || null,
    crp: formData.get("crp") || null,
    contato: contatoBruto ? Number(String(contatoBruto).replace(/\D/g, "")) : null,
  };

  const { error } = await supabase.from("Usuarios").update(dados).eq("id_user", user.id);

  if (error) {
    return { error: "Não foi possível salvar seus dados." };
  }

  revalidatePath("/configuracoes/conta");
  revalidatePath("/carne-leao");
  return { sucesso: true };
}
