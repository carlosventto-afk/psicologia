import { createClient } from "@/lib/supabase/server";
import { horizonteAtual, calcularProximaData } from "@/lib/recorrencia";

// Gera (insere) todos os lançamentos de despesa entre
// recorrenciaDespesa.gerado_ate (exclusive) e ateISO (inclusive), e avança
// gerado_ate até a última data gerada. Mesma lógica de
// gerarSessoesAteHorizonte em lib/recorrencia.js, adaptada pra
// LancamentoFinanceiro em vez de Sessao.
export async function gerarLancamentosAteHorizonte(recorrenciaDespesa, ateISO) {
  const supabase = await createClient();

  const novosLancamentos = [];
  let dataCursor = recorrenciaDespesa.gerado_ate;
  let proxima = calcularProximaData(dataCursor, recorrenciaDespesa.frequencia);

  while (proxima <= ateISO) {
    novosLancamentos.push({
      data: proxima,
      descricao: recorrenciaDespesa.descricao,
      valor: recorrenciaDespesa.valor,
      tipo: "Despesa",
      conta: recorrenciaDespesa.conta,
      classificacao: recorrenciaDespesa.classificacao,
      recorrencia_despesa_id: recorrenciaDespesa.id,
    });
    dataCursor = proxima;
    proxima = calcularProximaData(dataCursor, recorrenciaDespesa.frequencia);
  }

  if (novosLancamentos.length > 0) {
    const { error } = await supabase.from("LancamentoFinanceiro").insert(novosLancamentos);
    if (error) throw new Error(error.message);
  }

  if (dataCursor !== recorrenciaDespesa.gerado_ate) {
    const { error: erroUpdate } = await supabase
      .from("RecorrenciaDespesa")
      .update({ gerado_ate: dataCursor })
      .eq("id", recorrenciaDespesa.id);
    if (erroUpdate) throw new Error(erroUpdate.message);
  }

  return novosLancamentos.length;
}

// "Cron preguiçoso" — mesmo padrão de garantirRecorrenciasEstendidas em
// lib/recorrencia.js, chamado no carregamento da tela financeiro.
export async function garantirRecorrenciasDespesaEstendidas() {
  const supabase = await createClient();
  const ateISO = horizonteAtual();

  const { data: recorrencias, error } = await supabase
    .from("RecorrenciaDespesa")
    .select("id, descricao, valor, classificacao, conta, frequencia, data_inicio, gerado_ate")
    .eq("ativa", true)
    .lt("gerado_ate", ateISO);

  if (error) throw new Error(error.message);

  for (const recorrencia of recorrencias) {
    await gerarLancamentosAteHorizonte(recorrencia, ateISO);
  }
}
