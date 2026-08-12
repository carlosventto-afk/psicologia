"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verificarVinculosPaciente } from "@/lib/data/pacientes";

function dadosDoFormulario(formData) {
  const dependente = formData.get("dependente") === "on";
  const responsavelFinanceiro = dependente && formData.get("responsavel_financeiro")
    ? Number(formData.get("responsavel_financeiro"))
    : null;

  return {
    nome: formData.get("nome"),
    data_nascimento: formData.get("data_nascimento") || null,
    telefone: formData.get("telefone"),
    email: formData.get("email"),
    endereco: formData.get("endereco") || null,
    consultorio: Number(formData.get("consultorio")),
    pacote: formData.get("pacote") ? Number(formData.get("pacote")) : null,
    valor_sessao: Number(formData.get("valor_sessao")),
    observacoes: formData.get("observacoes") || null,
    precisa_recibo: formData.get("precisa_recibo") === "on",
    cpf: formData.get("cpf") || null,
    rg_numero: formData.get("rg_numero") || null,
    rg_data_expedicao: formData.get("rg_data_expedicao") || null,
    rg_orgao_emissor: formData.get("rg_orgao_emissor") || null,
    dependente,
    responsavel_financeiro: responsavelFinanceiro,
  };
}

function validarResponsavelFinanceiro(dados) {
  if (dados.dependente && !dados.responsavel_financeiro) {
    return "Selecione o responsável financeiro.";
  }
  return null;
}

export async function criarPaciente(prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const erroValidacao = validarResponsavelFinanceiro(dados);
  if (erroValidacao) return { error: erroValidacao };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("Paciente")
    .insert(dados)
    .select("id")
    .single();

  if (error) {
    return { error: "Não foi possível salvar o paciente." };
  }

  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function atualizarPaciente(id, prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const erroValidacao = validarResponsavelFinanceiro(dados);
  if (erroValidacao) return { error: erroValidacao };

  const supabase = await createClient();

  const { error } = await supabase.from("Paciente").update(dados).eq("id", id);

  if (error) {
    return { error: "Não foi possível atualizar o paciente." };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}

export async function excluirPaciente(id, prevState, formData) {
  const vinculos = await verificarVinculosPaciente(id);
  if (vinculos.length > 0) {
    return { bloqueado: true, vinculos };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").delete().eq("id", id);

  if (error) {
    return { error: "Não foi possível excluir o paciente." };
  }

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function desativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: false }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}

export async function reativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: true }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}
