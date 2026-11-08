import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";
import { sessaoElegivel, agruparPendenciasPorPaciente } from "@/lib/cobranca";

const CAMPOS_SESSAO =
  "id, data, horario, valor, status, Realizado, RecebimentoSessao(valor_aplicado), CobrancaSessao(ativa)";

// Acrescenta o vinculo ativo (sessao ja em outra cobranca) ao formato que
// sessaoElegivel espera, e normaliza o id.
function prepararSessao(s) {
  const base = normalizarIds(s, ["id"]);
  return {
    ...base,
    valor: Number(s.valor),
    emCobrancaAtiva: (s.CobrancaSessao ?? []).some((c) => c.ativa),
  };
}

function aplicarIntervalo(query, intervalo) {
  if (intervalo?.inicio) query = query.gte("data", intervalo.inicio);
  if (intervalo?.fim) query = query.lt("data", intervalo.fim);
  return query;
}

// Menor e maior data das sessoes vinculadas (historicas, se cancelada).
function intervaloDeDatas(vinculos) {
  const todos = vinculos ?? [];
  const ativos = todos.filter((v) => v.ativa);
  const datas = (ativos.length > 0 ? ativos : todos).map((v) => v.Sessao?.data).filter(Boolean).sort();
  return { data_inicio: datas[0] ?? null, data_fim: datas[datas.length - 1] ?? null };
}

export async function listarCobrancas({ situacao, pacienteId, periodo } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("Cobranca")
    .select(
      "id, created_at, paciente, valor_total, tipo_documento, situacao, periodo_referencia, recebida_em, responsavel_financeiro, Paciente(id, nome, apelido), CobrancaSessao(ativa, Sessao(data))"
    )
    .order("created_at", { ascending: false });

  if (situacao) query = query.eq("situacao", situacao);
  if (pacienteId) query = query.eq("paciente", pacienteId);
  if (periodo) query = query.eq("periodo_referencia", periodo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id", "paciente", "responsavel_financeiro"]).map((c) => ({
    ...c,
    valor_total: Number(c.valor_total),
    qtd_sessoes: (c.CobrancaSessao ?? []).filter((v) => v.ativa).length,
    ...intervaloDeDatas(c.CobrancaSessao),
  }));
}

export async function buscarCobranca(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Cobranca")
    .select(
      "id, created_at, paciente, valor_total, tipo_documento, situacao, periodo_referencia, recebida_em, responsavel_financeiro, Paciente(id, nome, apelido, documento), ResponsavelFinanceiro:responsavel_financeiro(id, nome), Recebimento:recebimento(id, data_recebimento, valor_total, forma_pagamento, conta), CobrancaSessao(id, ativa, valor, Sessao(id, data, horario))"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { CobrancaSessao: vinculos, Paciente: paciente, Recebimento: recebimento, ...resto } = data;
  const base = normalizarIds(resto, ["id", "paciente", "responsavel_financeiro"]);

  // Cobranca cancelada tem todos os vinculos inativos: mostra os historicos.
  const usar = base.situacao === "cancelada" ? (vinculos ?? []) : (vinculos ?? []).filter((v) => v.ativa);

  return {
    ...base,
    valor_total: Number(base.valor_total),
    paciente: normalizarIds(paciente, ["id"]),
    sessoes: usar
      .map((v) => ({
        id: Number(v.Sessao.id),
        data: v.Sessao.data,
        horario: v.Sessao.horario,
        valor: Number(v.valor),
      }))
      .sort((a, b) => ((a.data ?? "") + (a.horario ?? "") < (b.data ?? "") + (b.horario ?? "") ? -1 : 1)),
    recebimento: recebimento ? normalizarIds(recebimento, ["id", "conta"]) : null,
  };
}

export async function listarSessoesElegiveis(pacienteId, intervalo) {
  const supabase = await createClient();
  let query = supabase
    .from("Sessao")
    .select(CAMPOS_SESSAO)
    .eq("paciente", pacienteId)
    .order("data")
    .order("horario");
  query = aplicarIntervalo(query, intervalo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data.map(prepararSessao).filter(sessaoElegivel);
}

export async function listarPacientesComPendencias(intervalo) {
  const supabase = await createClient();
  let query = supabase
    .from("Sessao")
    .select(`${CAMPOS_SESSAO}, Paciente!inner(id, nome, apelido, documento, ativo)`)
    .order("data")
    .order("horario");
  query = aplicarIntervalo(query, intervalo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const sessoes = data.map((s) => ({
    ...prepararSessao(s),
    paciente: normalizarIds(s.Paciente, ["id"]),
  }));

  return agruparPendenciasPorPaciente(sessoes);
}
