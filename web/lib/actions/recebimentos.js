"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarRecebimento, consumirCredito } from "@/lib/recebimento";
import { calcularCreditoDisponivel } from "@/lib/data/recebimentos";

export async function registrarRecebimentoIndividual(sessaoId, pacienteId, prevState, formData) {
  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("valor")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    return { error: "Sessão não encontrada." };
  }

  const { error } = await criarRecebimento(supabase, {
    pacienteId,
    responsavelFinanceiroId: Number(formData.get("responsavel_financeiro")),
    sessoes: [{ id: sessaoId, valor: Number(sessao.valor) }],
    valorTotal: Number(sessao.valor),
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
  redirect("/agenda");
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
      .select("id, valor")
      .in("id", sessaoIds);

    if (erroSessoes) {
      return { error: "Não foi possível carregar as sessões selecionadas." };
    }

    sessoes = sessoesBrutas.map((s) => ({ id: s.id, valor: Number(s.valor) }));
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
    .select("valor")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    throw new Error("Sessão não encontrada.");
  }

  const credito = await calcularCreditoDisponivel(pacienteId);
  const recebimento = credito.recebimentos.find((r) => r.id === recebimentoId);

  if (!recebimento || recebimento.saldo < Number(sessao.valor)) {
    throw new Error("Crédito insuficiente para quitar esta sessão.");
  }

  const { error } = await consumirCredito(supabase, {
    recebimentoId,
    sessaoId,
    valorAplicado: Number(sessao.valor),
  });

  if (error) {
    throw new Error(error);
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/agenda");
}
