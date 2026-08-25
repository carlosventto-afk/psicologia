"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MENSAGENS_ERRO = {
  PACIENTE_NAO_ENCONTRADO: "Paciente não encontrado.",
  TOKEN_INVALIDO: "Este link não é mais válido, peça um novo ao seu profissional.",
  PROPOSTA_NAO_ENCONTRADA: "Proposta não encontrada.",
  JA_DECIDIDA: "Esta proposta já foi decidida.",
  PRAZO_EXPIRADO: "O prazo de 60 dias para aceitar esta proposta já passou.",
};

function mensagemAmigavel(error) {
  const codigo = Object.keys(MENSAGENS_ERRO).find((c) => error?.message?.includes(c));
  return codigo ? MENSAGENS_ERRO[codigo] : "Não foi possível concluir a ação.";
}

export async function gerarLinkCompletarCadastro(pacienteId, prevState, formData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gerar_link_completar_cadastro", {
    p_paciente_id: pacienteId,
  });

  if (error) return { error: mensagemAmigavel(error) };

  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { link: `${origem}/completar-cadastro/${data}` };
}

export async function enviarPropostaCompletarCadastro(token, prevState, formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_proposta_completar_cadastro", {
    p_token: token,
    p_telefone: formData.get("telefone") || null,
    p_email: formData.get("email") || null,
    p_endereco: formData.get("endereco") || null,
    p_cpf: formData.get("cpf") || null,
    p_rg_numero: formData.get("rg_numero") || null,
    p_rg_data_expedicao: formData.get("rg_data_expedicao") || null,
    p_rg_orgao_emissor: formData.get("rg_orgao_emissor") || null,
  });

  if (error) return { error: mensagemAmigavel(error) };

  return { enviado: true };
}

export async function aceitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData) {
  const supabase = await createClient();
  const camposAceitos = formData.getAll("campos");

  const { error } = await supabase.rpc("aceitar_proposta_completar_cadastro", {
    p_proposta_id: propostaId,
    p_campos_aceitos: camposAceitos,
  });

  if (error) return { error: mensagemAmigavel(error) };

  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}`);
}

export async function rejeitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rejeitar_proposta_completar_cadastro", {
    p_proposta_id: propostaId,
  });

  if (error) return { error: mensagemAmigavel(error) };

  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}`);
}
