"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { escolherResponsavel, mensagemErroCobranca } from "@/lib/cobranca";

const TIPOS = ["nenhum", "recibo", "nota_fiscal"];

function revalidarTudo(pacienteId) {
  revalidatePath("/cobrancas");
  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  if (pacienteId) revalidatePath(`/pacientes/${pacienteId}`);
}

// Cria a cobranca de um paciente. Devolve { id } ou { error }; so ids, tipo,
// periodo e responsavel vao ao banco (o SQL recalcula o saldo).
async function criarUma(supabase, { pacienteId, sessaoIds, tipoDocumento, periodo, responsavelEscolhido }) {
  if (!pacienteId) return { error: "Paciente não informado." };
  if (!TIPOS.includes(tipoDocumento)) return { error: "Tipo de documento inválido." };
  if (sessaoIds.length === 0) return { error: "Selecione ao menos uma sessão." };

  let responsaveis;
  try {
    responsaveis = await listarResponsaveisDoPaciente(pacienteId);
  } catch {
    return { error: "Não foi possível carregar os responsáveis financeiros." };
  }
  const resp = escolherResponsavel(responsaveis, responsavelEscolhido);
  if (resp.error) return { error: resp.error };

  const { data, error } = await supabase.rpc("criar_cobranca", {
    p_paciente: pacienteId,
    p_sessoes: sessaoIds,
    p_tipo_documento: tipoDocumento,
    p_periodo: periodo || null,
    p_responsavel: resp.id,
  });
  if (error) return { error: mensagemErroCobranca(error) };
  return { id: Number(data) };
}

export async function criarCobranca(prevState, formData) {
  const supabase = await createClient();
  const pacienteId = Number(formData.get("paciente"));
  const sessaoIds = formData.getAll("sessao_id").map(Number).filter(Boolean);
  const escolhido = formData.get("responsavel_financeiro");

  const r = await criarUma(supabase, {
    pacienteId,
    sessaoIds,
    tipoDocumento: formData.get("tipo_documento"),
    periodo: formData.get("periodo"),
    responsavelEscolhido: escolhido ? Number(escolhido) : null,
  });
  if (r.error) return { error: r.error };

  revalidarTudo(pacienteId);
  redirect(`/cobrancas/${r.id}`);
}

// Campos: paciente_id (repetido, um por paciente marcado); por paciente:
// tipo_documento_<id>, sessao_id_<id> (repetido), responsavel_financeiro_<id>
// (so quando ha mais de um responsavel); periodo (primeiro dia do mes).
export async function criarCobrancasDoMes(prevState, formData) {
  const supabase = await createClient();
  const periodo = formData.get("periodo");
  const pacienteIds = [...new Set(formData.getAll("paciente_id").map(Number).filter(Boolean))];

  if (pacienteIds.length === 0) return { error: "Marque ao menos um paciente." };

  const nomes = new Map();
  const { data: pacientes } = await supabase.from("Paciente").select("id, nome").in("id", pacienteIds);
  for (const p of pacientes ?? []) nomes.set(Number(p.id), p.nome);

  let criadas = 0;
  const falhas = [];

  // Cada paciente em sua propria transacao: uma falha nao aborta as outras.
  for (const pacienteId of pacienteIds) {
    const escolhido = formData.get(`responsavel_financeiro_${pacienteId}`);
    const r = await criarUma(supabase, {
      pacienteId,
      sessaoIds: formData.getAll(`sessao_id_${pacienteId}`).map(Number).filter(Boolean),
      tipoDocumento: formData.get(`tipo_documento_${pacienteId}`),
      periodo,
      responsavelEscolhido: escolhido ? Number(escolhido) : null,
    });
    if (r.error) {
      falhas.push({ pacienteId, nome: nomes.get(pacienteId) ?? `Paciente ${pacienteId}`, error: r.error });
    } else {
      criadas += 1;
    }
  }

  revalidatePath("/cobrancas/nova");
  revalidatePath("/cobrancas");
  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  for (const id of pacienteIds) revalidatePath(`/pacientes/${id}`);

  return { criadas, falhas };
}

export async function receberCobranca(cobrancaId, prevState, formData) {
  const supabase = await createClient();

  const { data: cob } = await supabase.from("Cobranca").select("paciente").eq("id", cobrancaId).maybeSingle();

  const { error } = await supabase.rpc("receber_cobranca", {
    p_cobranca: cobrancaId,
    p_data: formData.get("data_recebimento") || null,
    p_conta: Number(formData.get("conta")) || null,
    p_forma: formData.get("forma_pagamento") || null,
  });
  if (error) return { error: mensagemErroCobranca(error) };

  revalidarTudo(cob ? Number(cob.paciente) : null);
  revalidatePath(`/cobrancas/${cobrancaId}`);
  redirect(`/cobrancas/${cobrancaId}`);
}

export async function cancelarCobranca(cobrancaId) {
  const supabase = await createClient();

  const { data: cob } = await supabase.from("Cobranca").select("paciente").eq("id", cobrancaId).maybeSingle();

  const { error } = await supabase.rpc("cancelar_cobranca", { p_cobranca: cobrancaId });
  if (error) return { error: mensagemErroCobranca(error) };

  revalidarTudo(cob ? Number(cob.paciente) : null);
  revalidatePath(`/cobrancas/${cobrancaId}`);
  return { ok: true };
}
