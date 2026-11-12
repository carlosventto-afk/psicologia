"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarRecebimento, consumirCredito } from "@/lib/recebimento";
import { calcularCreditoDisponivel } from "@/lib/data/recebimentos";
import { textoBloqueioNota } from "@/lib/cobranca";

export async function registrarRecebimentoIndividual(sessaoId, pacienteId, prevState, formData) {
  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("valor, RecebimentoSessao(valor_aplicado)")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    return { error: "Sessão não encontrada." };
  }

  const valorRecebido = (sessao.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
  const saldoDevedor = Number(sessao.valor) - valorRecebido;

  const { error } = await criarRecebimento(supabase, {
    pacienteId,
    responsavelFinanceiroId: Number(formData.get("responsavel_financeiro")),
    sessoes: [{ id: sessaoId, valor: saldoDevedor }],
    valorTotal: saldoDevedor,
    contaId: Number(formData.get("conta")),
    formaPagamento: formData.get("forma_pagamento"),
    dataRecebimento: formData.get("data_recebimento"),
  });

  if (error) {
    return { error };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(formData.get("voltar_para") || "/agenda");
}

export async function registrarRecebimentoLote(pacienteId, prevState, formData) {
  const supabase = await createClient();

  const sessaoIds = formData.getAll("sessao_id").map(Number);
  const responsavelFinanceiroId = Number(formData.get("responsavel_financeiro"));
  const contaId = Number(formData.get("conta"));
  const formaPagamento = formData.get("forma_pagamento");
  const dataRecebimento = formData.get("data_recebimento");

  let sessoes = [];
  let valorTotal;

  if (sessaoIds.length > 0) {
    const { data: sessoesBrutas, error: erroSessoes } = await supabase
      .from("Sessao")
      .select("id, valor, RecebimentoSessao(valor_aplicado)")
      .in("id", sessaoIds);

    if (erroSessoes) {
      return { error: "Não foi possível carregar as sessões selecionadas." };
    }

    sessoes = sessoesBrutas.map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return { id: s.id, valor: Number(s.valor) - valorRecebido };
    });
    valorTotal = sessoes.reduce((soma, s) => soma + s.valor, 0);
  } else {
    valorTotal = Number(formData.get("valor_credito"));
    if (!valorTotal || valorTotal <= 0) {
      return { error: "Informe o valor do crédito a receber." };
    }
  }

  const { error } = await criarRecebimento(supabase, {
    pacienteId,
    responsavelFinanceiroId,
    sessoes,
    valorTotal,
    contaId,
    formaPagamento,
    dataRecebimento,
  });

  if (error) {
    return { error };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}?aba=sessoes`);
}

export async function usarCreditoNaSessao(pacienteId, sessaoId, recebimentoId) {
  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("valor, RecebimentoSessao(valor_aplicado)")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    return { error: "Sessão não encontrada." };
  }

  const valorRecebido = (sessao.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
  const saldoDevedor = Number(sessao.valor) - valorRecebido;

  const credito = await calcularCreditoDisponivel(pacienteId);
  const recebimento = credito.recebimentos.find((r) => r.id === recebimentoId);

  if (!recebimento || recebimento.saldo < saldoDevedor) {
    return { error: "Crédito insuficiente para quitar esta sessão." };
  }

  const { error } = await consumirCredito(supabase, {
    recebimentoId,
    sessaoId,
    valorAplicado: saldoDevedor,
  });

  if (error) {
    return { error };
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/agenda");
  return { error: null };
}

const MENSAGEM_NOTA_ATIVA = "Cancele a nota fiscal da cobrança antes de excluir o recebimento.";

export async function excluirRecebimento(pacienteId, recebimentoId) {
  const supabase = await createClient();

  const { data: recebimento, error: erroBusca } = await supabase
    .from("Recebimento")
    .select("lancamento")
    .eq("id", recebimentoId)
    .single();

  if (erroBusca) {
    throw new Error("Recebimento não encontrado.");
  }

  // Pre-checagem: o gatilho do banco tambem recusa, mas so ao excluir o
  // Recebimento, depois das alocacoes; checar antes evita um estado pela metade.
  const { data: cobrancas } = await supabase.from("Cobranca").select("id").eq("recebimento", recebimentoId);
  const cobrancaIds = (cobrancas ?? []).map((c) => c.id);
  if (cobrancaIds.length > 0) {
    const { data: notas } = await supabase
      .from("NotaFiscal")
      .select("id")
      .in("cobranca", cobrancaIds)
      .in("status", ["pendente", "autorizada"])
      .limit(1);
    if (notas?.length) return { error: MENSAGEM_NOTA_ATIVA };
  }

  const { error: erroAlocacoes } = await supabase
    .from("RecebimentoSessao")
    .delete()
    .eq("recebimento", recebimentoId);

  if (erroAlocacoes) {
    throw new Error("Não foi possível excluir o recebimento.");
  }

  const { error: erroRecebimento } = await supabase.from("Recebimento").delete().eq("id", recebimentoId);

  if (erroRecebimento) {
    const bloqueio = textoBloqueioNota(erroRecebimento);
    if (bloqueio) return { error: bloqueio };
    throw new Error("Não foi possível excluir o recebimento.");
  }

  const { error: erroLancamento } = await supabase
    .from("LancamentoFinanceiro")
    .delete()
    .eq("id", recebimento.lancamento);

  if (erroLancamento) {
    throw new Error("Não foi possível excluir o lançamento financeiro vinculado.");
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return { error: null };
}
