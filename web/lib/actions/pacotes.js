"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dadosDoFormulario(formData) {
  return {
    nome: formData.get("nome"),
    dimensao_atendimento: Number(formData.get("dimensao_atendimento")),
    dimensao_cobranca: Number(formData.get("dimensao_cobranca")),
    forma_cobranca: formData.get("forma_cobranca"),
    valor_sugerido: Number(formData.get("valor_sugerido")),
  };
}

export async function criarPacote(prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase.from("PacoteCobranca").insert(dadosDoFormulario(formData));

  if (error) {
    return { error: "Não foi possível salvar o pacote." };
  }

  revalidatePath("/pacotes");
  redirect("/pacotes");
}

export async function atualizarPacote(id, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("PacoteCobranca")
    .update(dadosDoFormulario(formData))
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível atualizar o pacote." };
  }

  revalidatePath("/pacotes");
  redirect("/pacotes");
}
