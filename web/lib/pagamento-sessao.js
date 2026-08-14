// Lógica de gravação de pagamento de sessão compartilhada entre a tela
// dedicada de pagamento e o registro de atendimento (que pode registrar o
// pagamento no mesmo passo). Recebe o client Supabase já autenticado do
// chamador em vez de criar o seu próprio, pra rodar dentro da mesma
// transação lógica da Server Action que a chamou.
export async function criarPagamentoSessao(supabase, { sessaoId, valor, contaId, formaPagamento, dataPagamento }) {
  const { data: lancamento, error: erroLancamento } = await supabase
    .from("LancamentoFinanceiro")
    .insert({
      data: dataPagamento,
      descricao: "Pagamento de sessão",
      valor,
      tipo: "Receita",
      conta: contaId,
      sessao: sessaoId,
    })
    .select("id")
    .single();

  if (erroLancamento) {
    return { error: "Não foi possível registrar o pagamento." };
  }

  const { error: erroPagamento } = await supabase.from("PagamentoSessao").insert({
    sessao: sessaoId,
    valor,
    data_pagamento: dataPagamento,
    forma_pagamento: formaPagamento,
    conta: contaId,
    lancamento: lancamento.id,
  });

  if (erroPagamento) {
    return { error: "Não foi possível registrar o pagamento." };
  }

  return { error: null };
}
