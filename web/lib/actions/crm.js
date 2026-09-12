"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarLeadManual(prevState, formData) {
  const nome = formData.get("nome");
  const telefone = formData.get("telefone");
  const email = formData.get("email");

  if (!nome || !telefone) {
    return { error: "Preencha nome e telefone." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("Lead").insert({
    nome,
    telefone,
    email: email || null,
    origem: "manual",
    estagio: "novo",
  });

  if (error) {
    return { error: "Não foi possível criar o lead." };
  }

  revalidatePath("/admin/leads");
  return { mensagem: "Lead criado." };
}

export async function atualizarEstagioLead(leadId, novoEstagio) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("Lead")
    .update({ estagio: novoEstagio, atualizado_em: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    return { error: "Não foi possível atualizar o estágio." };
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}

export async function retomarAgenteLead(leadId) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("Lead")
    .update({ aguardando_humano: false, atualizado_em: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    return { error: "Não foi possível devolver pro agente." };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}

export async function adicionarNotaLead(leadId, prevState, formData) {
  const texto = formData.get("texto");

  if (!texto) {
    return { error: "Escreva algo na nota." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("LeadNota").insert({
    lead_id: leadId,
    texto,
  });

  if (error) {
    return { error: "Não foi possível salvar a nota." };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  return { mensagem: "Nota adicionada." };
}
