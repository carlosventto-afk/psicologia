import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, Sessao!inner(data, Paciente!inner(nome, cpf, dependente, documento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf)))";

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

export async function listarPagamentosElegiveis({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("data_pagamento", dataInicio)
    .lte("data_pagamento", dataFim)
    .order("data_pagamento");

  if (error) throw new Error(error.message);

  const resolvidos = normalizarIdsLista(data, ["id"]).map(resolverPagamento);

  return {
    elegiveis: resolvidos.filter((p) => p.cpfPagador && p.cpfBeneficiario),
    semCpf: resolvidos.filter((p) => !p.cpfPagador || !p.cpfBeneficiario),
  };
}

export async function buscarPagamentosPorIds(ids) {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .in("id", ids)
    .eq("Sessao.Paciente.documento", "recibo");

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map(resolverPagamento)
    .filter((p) => p.cpfPagador && p.cpfBeneficiario);
}
