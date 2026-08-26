"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";

export async function criarClassificacao(prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase.from("ClassificacaoFinanceira").insert({
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
  });

  if (error) {
    return { error: "Não foi possível salvar a classificação." };
  }

  revalidatePath("/financeiro/classificacoes");
  redirect("/financeiro/classificacoes");
}

export async function carregarClassificacoesPadrao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autorizado.");
  }

  await criarClassificacoesPadrao(supabase, user.id);

  revalidatePath("/financeiro/classificacoes");
}
