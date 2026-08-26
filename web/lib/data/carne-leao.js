import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { cpfValido } from "@/lib/carne-leao-txt";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, carne_leao_gerado_em, Sessao!inner(data, Paciente!inner(nome, cpf, dependente, documento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf)))";

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
    jaGerado: p.carne_leao_gerado_em,
  };
}

// opcoes.supabase é um client service-role que ignora RLS — por isso
// ownerId é obrigatório junto dele, pra nunca rodar uma query sem escopo
// de profissional.
export async function listarPagamentosElegiveis({ dataInicio, dataFim }, opcoes = {}) {
  if (opcoes.supabase && !opcoes.ownerId) {
    throw new Error(
      "listarPagamentosElegiveis: ownerId é obrigatório ao passar um client service-role (supabase bypassa RLS)."
    );
  }

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

  // Geração automática (item 9) nunca deve incluir um pagamento já
  // marcado como gerado (item 10) — a geração manual, ao contrário,
  // continua listando tudo e só avisa o operador na UI.
  if (opcoes.excluirJaGerados) {
    query = query.is("carne_leao_gerado_em", null);
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

// Marca os pagamentos como "já entraram num TXT do Carnê-Leão" — chamado
// depois que o arquivo (manual ou automático) já foi montado com sucesso.
export async function marcarPagamentosGerados(ids, opcoes = {}) {
  if (ids.length === 0) return;

  const supabase = opcoes.supabase ?? (await createClient());
  const { error } = await supabase
    .from("PagamentoSessao")
    .update({ carne_leao_gerado_em: new Date().toISOString() })
    .in("id", ids);

  if (error) throw new Error(error.message);
}

export async function desmarcarPagamentoGerado(id) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("PagamentoSessao")
    .update({ carne_leao_gerado_em: null })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
