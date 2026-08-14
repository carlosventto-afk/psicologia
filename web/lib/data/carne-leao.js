import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { cpfValido } from "@/lib/carne-leao-txt";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, Sessao!inner(data, Paciente!inner(nome, cpf, dependente, documento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf)))";

function elegivel(p) {
  return cpfValido(p.cpfPagador) && cpfValido(p.cpfBeneficiario);
}

function resolverPagamento(p) {
  const paciente = p.Sessao.Paciente;
  const responsavel = paciente.ResponsavelFinanceiro;
  const cpfPagador = paciente.dependente ? responsavel?.cpf || null : paciente.cpf || null;

  return {
    pagamentoId: p.id,
    valor: p.valor,
    dataPagamento: p.data_pagamento,
    dataAtendimento: p.Sessao.data,
    pacienteNome: paciente.nome,
    pagadorNome: paciente.dependente ? responsavel?.nome ?? paciente.nome : paciente.nome,
    cpfPagador,
    cpfBeneficiario: paciente.cpf || null,
  };
}

export async function listarPagamentosElegiveis({ dataInicio, dataFim }, opcoes = {}) {
  const supabase = opcoes.supabase ?? (await createClient());

  let query = supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("data_pagamento", dataInicio)
    .lte("data_pagamento", dataFim)
    .order("data_pagamento");

  if (opcoes.ownerId) {
    query = query.eq("Sessao.owner", opcoes.ownerId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const resolvidos = normalizarIdsLista(data, ["id"]).map(resolverPagamento);

  return {
    elegiveis: resolvidos.filter(elegivel),
    semCpf: resolvidos.filter((p) => !elegivel(p)),
  };
}

export async function buscarPagamentosPorIds(ids, { dataInicio, dataFim }) {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .in("id", ids)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("data_pagamento", dataInicio)
    .lte("data_pagamento", dataFim);

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map(resolverPagamento)
    .filter(elegivel);
}
