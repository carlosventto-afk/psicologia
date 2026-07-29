"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarLancamento(prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase.from("LancamentoFinanceiro").insert({
    data: formData.get("data"),
    descricao: formData.get("descricao"),
    valor: Number(formData.get("valor")),
    tipo: formData.get("tipo"),
    conta: formData.get("conta") ? Number(formData.get("conta")) : null,
  });

  if (error) {
    return { error: "Não foi possível salvar o lançamento." };
  }

  revalidatePath("/financeiro/lancamentos");
  redirect("/financeiro/lancamentos");
}
