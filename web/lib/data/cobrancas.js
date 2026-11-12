import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";
import { sessaoDocumentada } from "@/lib/nota-fiscal";
import { sessaoElegivel, agruparPendenciasPorPaciente, cobrancaNoMes } from "@/lib/cobranca";

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

// periodo: "YYYY-MM" (periodo_referencia, ou datas das sessoes se for nulo).
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

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const lista = periodo
    ? data.filter((c) =>
        cobrancaNoMes(c, periodo, (c.CobrancaSessao ?? []).map((v) => v.Sessao?.data).filter(Boolean))
      )
    : data;

  return normalizarIdsLista(lista, ["id", "paciente", "responsavel_financeiro"]).map((c) => ({
    ...c,
    valor_total: Number(c.valor_total),
    qtd_sessoes: (c.CobrancaSessao ?? []).filter((v) => v.ativa).length,
    ...intervaloDeDatas(c.CobrancaSessao),
  }));
}

const CAMPOS_NOTA =
  "id, status, cobranca, recebimento_sessao, chave_acesso, ultimo_erro, numero, enviada_email_em, enviada_whatsapp_em, tentativas";

// Notas da cobranca: a nota da propria cobranca e, no modo por sessao, as notas
// dos RecebimentoSessao do recebimento. Erro de leitura nao derruba a pagina.
async function buscarNotasDaCobranca(supabase, { id, emissaoPor, recebimentoId }) {
  const sessaoDoRateio = new Map();
  const consultas = [supabase.from("NotaFiscal").select(CAMPOS_NOTA).eq("cobranca", id)];
  if (recebimentoId) {
    const { data: rateios } = await supabase
      .from("RecebimentoSessao")
      .select("id, sessao")
      .eq("recebimento", recebimentoId);
    for (const r of rateios ?? []) sessaoDoRateio.set(Number(r.id), Number(r.sessao));
    const ids = [...sessaoDoRateio.keys()];
    if (emissaoPor === "sessao" && ids.length > 0) {
      consultas.push(supabase.from("NotaFiscal").select(CAMPOS_NOTA).in("recebimento_sessao", ids));
    }
  }
  const resultados = await Promise.all(consultas);
  const notas = resultados
    .flatMap((r) => (r.error ? [] : (r.data ?? [])))
    .map((n) => {
      const nota = normalizarIds(n, ["id", "numero", "tentativas", "cobranca", "recebimento_sessao"]);
      return { ...nota, sessao: sessaoDoRateio.get(nota.recebimento_sessao) ?? null };
    })
    .sort((a, b) => a.id - b.id);
  return { notas, sessaoDoRateio };
}

export async function buscarCobranca(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Cobranca")
    .select(
      "id, created_at, paciente, valor_total, tipo_documento, situacao, periodo_referencia, recebida_em, responsavel_financeiro, emissao_por, Paciente(id, nome, apelido, documento), ResponsavelFinanceiro:responsavel_financeiro(id, nome), Recebimento:recebimento(id, data_recebimento, valor_total, forma_pagamento, conta), CobrancaSessao(id, ativa, valor, Sessao(id, data, horario))"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { CobrancaSessao: vinculos, Paciente: paciente, Recebimento: recebimento, ...resto } = data;
  const base = normalizarIds(resto, ["id", "paciente", "responsavel_financeiro"]);

  // Cobranca cancelada tem todos os vinculos inativos: mostra os historicos.
  const usar = base.situacao === "cancelada" ? (vinculos ?? []) : (vinculos ?? []).filter((v) => v.ativa);

  const { notas, sessaoDoRateio } = await buscarNotasDaCobranca(supabase, {
    id: base.id,
    emissaoPor: base.emissao_por,
    recebimentoId: recebimento ? Number(recebimento.id) : null,
  });

  return {
    ...base,
    notas,
    valor_total: Number(base.valor_total),
    paciente: normalizarIds(paciente, ["id"]),
    sessoes: usar
      .map((v) => ({
        id: Number(v.Sessao.id),
        data: v.Sessao.data,
        horario: v.Sessao.horario,
        valor: Number(v.valor),
        // Mesma regra da aba Sessoes do paciente (sessaoDocumentada): cobranca sem
        // recebimento (reaberta) nao documenta nada, mesmo com nota antiga.
        documentada: sessaoDocumentada({
          vinculos: [
            {
              ativa: true,
              Cobranca: {
                recebimento: recebimento?.id ?? null,
                NotaFiscal: notas.filter((n) => n.cobranca != null),
              },
            },
          ],
          rateios: [...sessaoDoRateio]
            .filter(([, sessao]) => sessao === Number(v.Sessao.id))
            .map(([rateioId]) => ({
              recebimento: recebimento?.id ?? null,
              NotaFiscal: notas.filter((n) => n.recebimento_sessao === rateioId),
            })),
        }),
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
    .select(`${CAMPOS_SESSAO}, Paciente!inner(id, nome, apelido, documento, ativo, nota_por_sessao)`)
    .order("data")
    .order("horario");
  query = aplicarIntervalo(query, intervalo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const sessoes = data.map((s) => ({
    ...prepararSessao(s),
    paciente: normalizarIds(s.Paciente, ["id"]),
  }));

  const grupos = agruparPendenciasPorPaciente(sessoes);
  if (grupos.length === 0) return grupos;

  // Responsaveis financeiros vinculados (campo extra `responsaveis`; o resto do
  // formato e o mesmo de antes).
  const ids = grupos.map((g) => g.paciente.id);
  const { data: vinculos, error: erroResp } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .select("paciente, ResponsavelFinanceiro!inner(id, nome, paciente_vinculado)")
    .in("paciente", ids);
  if (erroResp) throw new Error(erroResp.message);

  const porPaciente = new Map();
  for (const v of vinculos ?? []) {
    const pid = Number(v.paciente);
    const lista = porPaciente.get(pid) ?? [];
    lista.push({
      id: Number(v.ResponsavelFinanceiro.id),
      nome: v.ResponsavelFinanceiro.nome,
      eh_proprio: Number(v.ResponsavelFinanceiro.paciente_vinculado) === pid,
    });
    porPaciente.set(pid, lista);
  }
  return grupos.map((g) => ({ ...g, responsaveis: porPaciente.get(Number(g.paciente.id)) ?? [] }));
}
