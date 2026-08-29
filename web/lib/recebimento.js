// Logica de gravacao de recebimento compartilhada entre os fluxos de
// recebimento individual, em lote e credito antecipado. Recebe o client
// Supabase ja autenticado do chamador (mesma convencao do antigo
// criarPagamentoSessao em lib/pagamento-sessao.js), pra rodar dentro da
// mesma acao do chamador.
export async function criarRecebimento(supabase, {
  pacienteId,
  responsavelFinanceiroId,
  sessoes,
  valorTotal,
  contaId,
  formaPagamento,
  dataRecebimento,
}) {
  const { data: lancamento, error: erroLancamento } = await supabase
    .from("LancamentoFinanceiro")
    .insert({
      data: dataRecebimento,
      descricao: "Recebimento de sessão",
      valor: valorTotal,
      tipo: "Receita",
      conta: contaId,
      sessao: null,
    })
    .select("id")
    .single();

  if (erroLancamento) {
    return { error: "Não foi possível registrar o recebimento." };
  }

  const { data: recebimento, error: erroRecebimento } = await supabase
    .from("Recebimento")
    .insert({
      paciente: pacienteId,
      responsavel_financeiro: responsavelFinanceiroId,
      data_recebimento: dataRecebimento,
      valor_total: valorTotal,
      forma_pagamento: formaPagamento,
      conta: contaId,
      lancamento: lancamento.id,
    })
    .select("id")
    .single();

  if (erroRecebimento) {
    return { error: "Não foi possível registrar o recebimento." };
  }

  if (sessoes.length > 0) {
    const { error: erroAlocacao } = await supabase.from("RecebimentoSessao").insert(
      sessoes.map((s) => ({
        recebimento: recebimento.id,
        sessao: s.id,
        valor_aplicado: s.valor,
      }))
    );

    if (erroAlocacao) {
      return { error: "Não foi possível vincular as sessões ao recebimento." };
    }
  }

  return { error: null, recebimentoId: recebimento.id };
}

export async function consumirCredito(supabase, { recebimentoId, sessaoId, valorAplicado }) {
  const { error } = await supabase.from("RecebimentoSessao").insert({
    recebimento: recebimentoId,
    sessao: sessaoId,
    valor_aplicado: valorAplicado,
  });

  if (error) {
    return { error: "Não foi possível usar o crédito nessa sessão." };
  }

  return { error: null };
}
