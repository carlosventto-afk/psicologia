import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarPacientes({ busca = "", status = "ativos" } = {}) {
  const supabase = await createClient();

  let query = supabase.from("Paciente").select("id, nome, telefone, email, valor_sessao, ativo").order("nome");

  if (busca) query = query.ilike("nome", `%${busca}%`);
  if (status === "ativos") query = query.eq("ativo", true);
  else if (status === "inativos") query = query.eq("ativo", false);

  const { data: pacientesBrutos, error } = await query;
  if (error) throw new Error(error.message);

  const pacientes = normalizarIdsLista(pacientesBrutos, ["id"]);
  if (pacientes.length === 0) return [];

  const ids = pacientes.map((p) => p.id);
  const hoje = new Date().toISOString().slice(0, 10);

  // Realizado = false cobre tanto sessões marcadas quanto as antigas sem
  // status definido (legado); usar status = 'Marcada' deixaria de fora as
  // sessões antigas com status nulo.
  const { data: sessoesBrutas, error: erroSessoes } = await supabase
    .from("Sessao")
    .select("paciente, data, horario")
    .in("paciente", ids)
    .eq("Realizado", false)
    .gte("data", hoje)
    .order("data")
    .order("horario");

  if (erroSessoes) throw new Error(erroSessoes.message);

  const sessoes = normalizarIdsLista(sessoesBrutas, ["paciente"]);

  const proximaSessaoPorPaciente = {};
  for (const s of sessoes) {
    if (!proximaSessaoPorPaciente[s.paciente]) {
      proximaSessaoPorPaciente[s.paciente] = s;
    }
  }

  return pacientes.map((p) => ({
    ...p,
    proxima_sessao: proximaSessaoPorPaciente[p.id] ?? null,
  }));
}

export async function listarPacientesParaSelect(excluirId, incluirId) {
  const supabase = await createClient();
  let query = supabase.from("Paciente").select("id, nome, pacote").eq("ativo", true).order("nome");
  if (excluirId) query = query.neq("id", excluirId);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  const pacientes = normalizarIdsLista(data, ["id", "pacote"]);

  if (incluirId != null && !pacientes.some((p) => p.id === Number(incluirId))) {
    const { data: extra, error: erroExtra } = await supabase
      .from("Paciente")
      .select("id, nome, pacote")
      .eq("id", incluirId)
      .maybeSingle();

    if (erroExtra) throw new Error(erroExtra.message);
    if (extra) {
      const extraNormalizado = normalizarIds(extra, ["id", "pacote"]);
      pacientes.push({ ...extraNormalizado, nome: `${extraNormalizado.nome} (inativo)` });
    }
  }

  return pacientes;
}

export async function verificarVinculosPaciente(id) {
  const supabase = await createClient();

  const [sessoes, recibos, recorrencias, recebimentos, responsavelProprio] = await Promise.all([
    supabase.from("Sessao").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recibo").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recorrencia").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recebimento").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("ResponsavelFinanceiro").select("id").eq("paciente_vinculado", id).maybeSingle(),
  ]);

  if (sessoes.error) throw new Error(sessoes.error.message);
  if (recibos.error) throw new Error(recibos.error.message);
  if (recorrencias.error) throw new Error(recorrencias.error.message);
  if (recebimentos.error) throw new Error(recebimentos.error.message);
  if (responsavelProprio.error) throw new Error(responsavelProprio.error.message);

  const vinculos = [];
  if (sessoes.count > 0) vinculos.push({ tipo: "sessão(ões)", quantidade: sessoes.count });
  if (recibos.count > 0) vinculos.push({ tipo: "recibo(s)", quantidade: recibos.count });
  if (recorrencias.count > 0) vinculos.push({ tipo: "recorrência(s)", quantidade: recorrencias.count });
  if (recebimentos.count > 0) {
    vinculos.push({ tipo: "recebimento(s) (crédito antecipado)", quantidade: recebimentos.count });
  }

  if (responsavelProprio.data) {
    const { data: outrosPacientes, error: erroOutros } = await supabase
      .from("PacienteResponsavelFinanceiro")
      .select("Paciente:paciente(nome)")
      .eq("responsavel", responsavelProprio.data.id)
      .neq("paciente", id);

    if (erroOutros) throw new Error(erroOutros.message);
    if (outrosPacientes.length > 0) {
      vinculos.push({ tipo: "é responsável financeiro de", nomes: outrosPacientes.map((v) => v.Paciente.nome) });
    }
  }

  return vinculos;
}

export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, documento, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro, ativo, ResponsavelFinanceiro:responsavel_financeiro(nome)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  const normalizado = normalizarIds(data, ["id", "consultorio", "pacote", "responsavel_financeiro"]);
  return {
    ...normalizado,
    responsavel_nome: data.ResponsavelFinanceiro?.nome ?? null,
  };
}

export async function listarSessoesDoPaciente(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, status, tipo_sessao, valor, RecebimentoSessao(recebimento, valor_aplicado)")
    .eq("paciente", pacienteId)
    .order("data", { ascending: false })
    .order("horario", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((s) => {
    const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    return {
      id: s.id,
      data: s.data,
      horario: s.horario,
      status: s.status,
      tipo_sessao: s.tipo_sessao,
      valor: Number(s.valor),
      valor_recebido: valorRecebido,
      saldo_devedor: Number(s.valor) - valorRecebido,
      recebimento_id: s.RecebimentoSessao?.[0] ? Number(s.RecebimentoSessao[0].recebimento) : null,
    };
  });
}
