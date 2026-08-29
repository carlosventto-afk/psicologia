"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarResponsavelFinanceiro(prevState, formData) {
  const supabase = await createClient();
  const pacienteVinculado = formData.get("paciente_vinculado") ? Number(formData.get("paciente_vinculado")) : null;

  const { error } = await supabase.from("ResponsavelFinanceiro").insert({
    nome: formData.get("nome"),
    cpf_cnpj: formData.get("cpf_cnpj") || null,
    telefone: formData.get("telefone") || null,
    email: formData.get("email") || null,
    paciente_vinculado: pacienteVinculado,
  });

  if (error) {
    return { error: "Não foi possível salvar o responsável financeiro." };
  }

  revalidatePath("/responsaveis-financeiros");
  return { error: null, sucesso: true };
}

export async function criarEVincularResponsavel(pacienteId, prevState, formData) {
  const supabase = await createClient();

  const { data: responsavel, error: erroCriar } = await supabase
    .from("ResponsavelFinanceiro")
    .insert({
      nome: formData.get("nome"),
      cpf_cnpj: formData.get("cpf_cnpj") || null,
      telefone: formData.get("telefone") || null,
      email: formData.get("email") || null,
    })
    .select("id")
    .single();

  if (erroCriar) {
    return { error: "Não foi possível criar o responsável financeiro." };
  }

  const { error: erroVinculo } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .insert({ paciente: pacienteId, responsavel: responsavel.id });

  if (erroVinculo) {
    return { error: "Não foi possível vincular o responsável financeiro." };
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  return { error: null, sucesso: true };
}

export async function vincularResponsavelExistente(pacienteId, prevState, formData) {
  const supabase = await createClient();
  const responsavelId = Number(formData.get("responsavel_id"));

  const { error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .insert({ paciente: pacienteId, responsavel: responsavelId });

  if (error) {
    return { error: "Não foi possível vincular o responsável financeiro." };
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  return { error: null, sucesso: true };
}

export async function desvincularResponsavel(pacienteId, responsavelId) {
  const supabase = await createClient();

  const { data: responsavel, error: erroBusca } = await supabase
    .from("ResponsavelFinanceiro")
    .select("paciente_vinculado")
    .eq("id", responsavelId)
    .single();

  if (erroBusca) {
    throw new Error("Responsável financeiro não encontrado.");
  }

  if (Number(responsavel.paciente_vinculado) === Number(pacienteId)) {
    throw new Error("Não é possível desvincular o responsável próprio do paciente.");
  }

  const { error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .delete()
    .eq("paciente", pacienteId)
    .eq("responsavel", responsavelId);

  if (error) {
    throw new Error("Não foi possível desvincular o responsável financeiro.");
  }

  revalidatePath(`/pacientes/${pacienteId}`);
}
