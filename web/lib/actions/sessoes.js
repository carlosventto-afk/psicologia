"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gerarSessoesAteHorizonte, horizonteAtual, diffDias, somarDias } from "@/lib/recorrencia";
import { criarRecebimento } from "@/lib/recebimento";
import { cancelarRecorrencia } from "@/lib/actions/recorrencias";

export async function criarSessao(prevState, formData) {
  const supabase = await createClient();

  const paciente = Number(formData.get("paciente"));
  const data = formData.get("data");
  const horario = formData.get("horario");
  const duracao_min = Number(formData.get("duracao_min"));
  const tipoSessao = formData.get("tipo_sessao");
  const valor = Number(formData.get("valor"));

  const { error: erroPaciente } = await supabase
    .from("Paciente")
    .select("id")
    .eq("id", paciente)
    .single();

  if (erroPaciente) {
    return { error: "Paciente não encontrado." };
  }

  let recorrenciaCriada = null;

  // Semanal/Quinzenal/Mensal: cria a série (Recorrencia) antes da sessão,
  // pra já linkar recorrencia_id na sessão inicial. Avulso não cria série.
  if (tipoSessao !== "Avulso") {
    const { data: recorrencia, error: erroRecorrencia } = await supabase
      .from("Recorrencia")
      .insert({
        paciente,
        frequencia: tipoSessao,
        horario,
        duracao_min,
        tipo_sessao: tipoSessao,
        data_inicio: data,
        gerado_ate: data,
      })
      .select("id, paciente, frequencia, horario, duracao_min, tipo_sessao, data_inicio, gerado_ate")
      .single();

    if (erroRecorrencia) {
      return { error: "Não foi possível criar a recorrência." };
    }
    recorrenciaCriada = recorrencia;
  }

  const { error } = await supabase.from("Sessao").insert({
    paciente,
    data,
    horario,
    duracao_min,
    tipo_sessao: tipoSessao,
    valor,
    status: "Marcada",
    Realizado: false,
    recorrencia_id: recorrenciaCriada?.id ?? null,
  });

  if (error) {
    return { error: "Não foi possível salvar a sessão." };
  }

  // Estende a série até o horizonte de 3 meses (gera as próximas ocorrências
  // além da sessão inicial que acabou de ser criada).
  if (recorrenciaCriada) {
    await gerarSessoesAteHorizonte(recorrenciaCriada, horizonteAtual());
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/recorrencias");
  redirect(formData.get("voltar_para") || "/agenda");
}

export async function atualizarSessao(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { data: sessaoAntes, error: erroSessaoAntes } = await supabase
    .from("Sessao")
    .select("data, horario, recorrencia_id, Realizado")
    .eq("id", sessaoId)
    .single();

  if (erroSessaoAntes) {
    return { error: "Não foi possível carregar a sessão." };
  }

  if (sessaoAntes.Realizado) {
    return { error: "Esta sessão já foi registrada como realizada e não pode ser editada." };
  }

  const novaData = formData.get("data");
  const novoHorario = formData.get("horario");
  const aplicarSerie = formData.get("aplicar_serie") === "true";

  const { error } = await supabase
    .from("Sessao")
    .update({
      paciente: Number(formData.get("paciente")),
      data: novaData,
      horario: novoHorario,
      duracao_min: Number(formData.get("duracao_min")),
      tipo_sessao: formData.get("tipo_sessao"),
      valor: Number(formData.get("valor")),
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível atualizar a sessão." };
  }

  if (aplicarSerie && sessaoAntes.recorrencia_id) {
    await propagarDataHorarioParaSerie({
      supabase,
      recorrenciaId: sessaoAntes.recorrencia_id,
      sessaoEditadaId: sessaoId,
      dataAntiga: sessaoAntes.data,
      deltaDias: diffDias(sessaoAntes.data, novaData),
      horarioMudou: sessaoAntes.horario !== novoHorario,
      novoHorario,
    });
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect(formData.get("voltar_para") || "/agenda");
}

// Desloca (por dias) e/ou atualiza o horário das demais sessões futuras e
// ainda não realizadas da mesma recorrência, preservando o espaçamento entre
// elas — não recalcula a série do zero. Ver design em conversa com o usuário
// (opção A: delta de dias, não regeração).
async function propagarDataHorarioParaSerie({
  supabase,
  recorrenciaId,
  sessaoEditadaId,
  dataAntiga,
  deltaDias,
  horarioMudou,
  novoHorario,
}) {
  if (deltaDias === 0 && !horarioMudou) return;

  const { data: futuras, error } = await supabase
    .from("Sessao")
    .select("id, data")
    .eq("recorrencia_id", recorrenciaId)
    .eq("Realizado", false)
    .gte("data", dataAntiga)
    .neq("id", sessaoEditadaId);

  if (error || !futuras) return;

  for (const futura of futuras) {
    await supabase
      .from("Sessao")
      .update({
        data: deltaDias !== 0 ? somarDias(futura.data, deltaDias) : futura.data,
        horario: novoHorario,
      })
      .eq("id", futura.id);
  }
}

export async function cancelarSessao(sessaoId, formData) {
  const supabase = await createClient();

  const { data: sessaoAtual, error: erroSessaoAtual } = await supabase
    .from("Sessao")
    .select("recorrencia_id, Realizado")
    .eq("id", sessaoId)
    .single();

  if (erroSessaoAtual) {
    throw new Error(erroSessaoAtual.message);
  }

  if (sessaoAtual.Realizado) {
    throw new Error("Esta sessão já foi registrada como realizada e não pode ser cancelada.");
  }

  const aplicarSerie = formData?.get?.("aplicar_serie") === "true";
  const voltarPara = formData?.get?.("voltar_para") || "/agenda";

  // "Todas as futuras": reaproveita cancelarRecorrencia, que já desativa a
  // série inteira e cancela as sessões futuras não realizadas (inclusive
  // esta) — evita duplicar essa decisão em dois lugares.
  if (aplicarSerie && sessaoAtual.recorrencia_id) {
    await cancelarRecorrencia(sessaoAtual.recorrencia_id);
    revalidatePath("/agenda");
    revalidatePath("/");
    redirect(voltarPara);
  }

  const { data: alocacoes, error: erroAlocacoes } = await supabase
    .from("RecebimentoSessao")
    .select("id")
    .eq("sessao", sessaoId);

  if (erroAlocacoes) {
    throw new Error(erroAlocacoes.message);
  }

  if (alocacoes.length > 0) {
    throw new Error("Esta sessão já tem recebimento aplicado. Desfaça a alocação no recebimento antes de cancelar.");
  }

  // Sem recebimento vinculado (checado acima): apaga de vez em vez de marcar
  // "Cancelada" — não há razão pra manter a linha acumulando na tabela.
  const { error } = await supabase.from("Sessao").delete().eq("id", sessaoId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect(voltarPara);
}

export async function marcarAtendimentoRealizado(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({
      status: "Realizada",
      Realizado: true,
      anotacoes: formData.get("anotacoes") || null,
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível registrar o atendimento." };
  }

  if (formData.get("pagou") === "on") {
    const { data: sessaoAtual, error: erroSessaoAtual } = await supabase
      .from("Sessao")
      .select("paciente, valor, RecebimentoSessao(valor_aplicado)")
      .eq("id", sessaoId)
      .single();

    if (erroSessaoAtual) {
      return { error: "Não foi possível carregar a sessão." };
    }

    const valorRecebido = (sessaoAtual.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    const saldoDevedor = Number(sessaoAtual.valor) - valorRecebido;

    const { error: erroRecebimento } = await criarRecebimento(supabase, {
      pacienteId: sessaoAtual.paciente,
      responsavelFinanceiroId: Number(formData.get("responsavel_financeiro")),
      sessoes: [{ id: sessaoId, valor: saldoDevedor }],
      valorTotal: saldoDevedor,
      contaId: Number(formData.get("conta")),
      formaPagamento: formData.get("forma_pagamento"),
      dataRecebimento: formData.get("data_pagamento"),
    });

    if (erroRecebimento) {
      return { error: erroRecebimento };
    }
  }

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/");
  redirect(formData.get("voltar_para") || "/agenda?registrado=1");
}
