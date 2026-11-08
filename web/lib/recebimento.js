import { mensagemBloqueioOu, mensagemSessaoEmCobranca, primeiraCobrancaAberta } from "@/lib/cobranca";

// Procura, entre as sessoes informadas, a primeira que esta em cobranca aberta
// (vinculo ativo). Devolve { cobrancaId } (ou null) e { error } se a consulta falhar.
export async function buscarCobrancaAbertaDasSessoes(supabase, sessaoIds) {
  const ids = (sessaoIds ?? []).filter((id) => id !== null && id !== undefined);
  if (ids.length === 0) return { cobrancaId: null, error: null };

  const { data, error } = await supabase
    .from("CobrancaSessao")
    .select("ativa, Cobranca(id, situacao)")
    .eq("ativa", true)
    .in("sessao", ids);

  if (error) return { cobrancaId: null, error };
  return { cobrancaId: primeiraCobrancaAberta(data), error: null };
}

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
  // Sessao em cobranca aberta so recebe pela cobranca. Checa ANTES de gravar
  // qualquer coisa: o trigger so dispara no ultimo insert (RecebimentoSessao),
  // o que deixaria Lancamento/Recebimento orfaos.
  const { cobrancaId, error: erroCobranca } = await buscarCobrancaAbertaDasSessoes(
    supabase,
    sessoes.map((s) => s.id)
  );
  if (erroCobranca) {
    return { error: "Não foi possível registrar o recebimento." };
  }
  if (cobrancaId !== null) {
    return { error: mensagemSessaoEmCobranca(cobrancaId) };
  }

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

  // Desfaz (melhor esforco) o que esta chamada criou: primeiro o Recebimento
  // (que referencia o lancamento), depois o Lancamento.
  const desfazer = async (recebimentoId) => {
    try {
      if (recebimentoId) await supabase.from("Recebimento").delete().eq("id", recebimentoId);
      await supabase.from("LancamentoFinanceiro").delete().eq("id", lancamento.id);
    } catch {
      // melhor esforco
    }
  };

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
    await desfazer(null);
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
      await desfazer(recebimento.id);
      return {
        error: mensagemBloqueioOu(erroAlocacao, "Não foi possível vincular as sessões ao recebimento."),
      };
    }
  }

  return { error: null, recebimentoId: recebimento.id };
}

export async function consumirCredito(supabase, { recebimentoId, sessaoId, valorAplicado }) {
  const { cobrancaId, error: erroCobranca } = await buscarCobrancaAbertaDasSessoes(supabase, [sessaoId]);
  if (erroCobranca) {
    return { error: "Não foi possível usar o crédito nessa sessão." };
  }
  if (cobrancaId !== null) {
    return { error: mensagemSessaoEmCobranca(cobrancaId) };
  }

  const { error } = await supabase.from("RecebimentoSessao").insert({
    recebimento: recebimentoId,
    sessao: sessaoId,
    valor_aplicado: valorAplicado,
  });

  if (error) {
    return { error: mensagemBloqueioOu(error, "Não foi possível usar o crédito nessa sessão.") };
  }

  return { error: null };
}
