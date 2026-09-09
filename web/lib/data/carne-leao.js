import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { cpfValido } from "@/lib/carne-leao-txt";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

// pagamentoId aqui é o id de RecebimentoSessao (nao mais PagamentoSessao) —
// nome do campo mantido de proposito pra nao exigir mudanca nos 3
// consumidores que so repassam esse id sem exibir o nome do campo.
const SELECT_RECEBIMENTO_SESSAO =
  "id, valor_aplicado, carne_leao_gerado_em, Recebimento!inner(data_recebimento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf_cnpj, paciente_vinculado)), Sessao!inner(data, Paciente!inner(id, nome, apelido, cpf, documento))";

function elegivel(p) {
  return cpfValido(p.cpfPagador) && cpfValido(p.cpfBeneficiario);
}

function resolverRecebimentoSessao(rs) {
  const paciente = rs.Sessao.Paciente;
  const responsavel = rs.Recebimento.ResponsavelFinanceiro;
  // "proprio" = o responsavel financeiro do recebimento é o auto-provisionado
  // do proprio paciente (aponta pra ele mesmo) — nesse caso o CPF certo é o
  // do Paciente, já que o ResponsavelFinanceiro "proprio" nunca tem cpf_cnpj
  // preenchido (só nome, ver Tasks 4/17/27).
  const ehProprio = responsavel?.paciente_vinculado === paciente.id;
  const cpfPagador = ehProprio ? paciente.cpf || null : responsavel?.cpf_cnpj || null;

  return {
    pagamentoId: rs.id,
    valor: rs.valor_aplicado,
    dataPagamento: rs.Recebimento.data_recebimento,
    dataAtendimento: rs.Sessao.data,
    pacienteNome: formatarNomePaciente(paciente.nome, paciente.apelido),
    pagadorNome: ehProprio || !responsavel?.nome ? formatarNomePaciente(paciente.nome, paciente.apelido) : responsavel.nome,
    cpfPagador,
    cpfBeneficiario: paciente.cpf || null,
    jaGerado: rs.carne_leao_gerado_em,
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
    .from("RecebimentoSessao")
    .select(SELECT_RECEBIMENTO_SESSAO)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("Recebimento.data_recebimento", dataInicio)
    .lte("Recebimento.data_recebimento", dataFim)
    .order("data_recebimento", { referencedTable: "Recebimento" });

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

  const resolvidos = normalizarIdsLista(data, ["id"]).map(resolverRecebimentoSessao);

  return {
    elegiveis: resolvidos.filter(elegivel),
    semCpf: resolvidos.filter((p) => !elegivel(p)),
  };
}

export async function buscarPagamentosPorIds(ids, { dataInicio, dataFim }) {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("RecebimentoSessao")
    .select(SELECT_RECEBIMENTO_SESSAO)
    .in("id", ids)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("Recebimento.data_recebimento", dataInicio)
    .lte("Recebimento.data_recebimento", dataFim);

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map(resolverRecebimentoSessao)
    .filter(elegivel);
}

// Marca os pagamentos como "já entraram num TXT do Carnê-Leão" — chamado
// depois que o arquivo (manual ou automático) já foi montado com sucesso.
export async function marcarPagamentosGerados(ids, opcoes = {}) {
  if (ids.length === 0) return;

  const supabase = opcoes.supabase ?? (await createClient());
  const { error } = await supabase
    .from("RecebimentoSessao")
    .update({ carne_leao_gerado_em: new Date().toISOString() })
    .in("id", ids);

  if (error) throw new Error(error.message);
}

export async function desmarcarPagamentoGerado(id) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("RecebimentoSessao")
    .update({ carne_leao_gerado_em: null })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
