"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";

export async function criarConsultorio(prevState, formData) {
  const usuario = await buscarUsuarioAtual();
  const supabase = await createClient();

  const limite = PLANOS[usuario.plano].limiteConsultorios;
  if (limite !== null) {
    const { count } = await supabase.from("Consultorio").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= limite) {
      return {
        error: `Seu plano permite até ${limite} consultório(s). Faça upgrade para adicionar mais.`,
        bloqueadoPorPlano: true,
      };
    }
  }

  const { error } = await supabase.from("Consultorio").insert({
    nome: formData.get("nome"),
    endereco: formData.get("endereco") || null,
    telefone: formData.get("telefone"),
    email_atendimento: formData.get("email_atendimento"),
  });

  if (error) {
    return { error: "Não foi possível salvar o consultório." };
  }

  revalidatePath("/consultorios");
  redirect("/consultorios");
}

export async function atualizarConsultorio(id, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Consultorio")
    .update({
      nome: formData.get("nome"),
      endereco: formData.get("endereco") || null,
      telefone: formData.get("telefone"),
      email_atendimento: formData.get("email_atendimento"),
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível atualizar o consultório." };
  }

  revalidatePath("/consultorios");
  redirect("/consultorios");
}
