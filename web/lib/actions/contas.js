"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarConta(prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase.from("ContaFinanceira").insert({
    codigo: formData.get("codigo"),
    nome: formData.get("nome"),
    banco: formData.get("banco"),
    agencia: formData.get("agencia"),
    numero: formData.get("numero"),
    tipo: formData.get("tipo"),
  });

  if (error) {
    return { error: "Não foi possível salvar a conta." };
  }

  revalidatePath("/financeiro/contas");
  redirect("/financeiro/contas");
}
