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

export async function listarPacientesParaSelect(excluirId) {
  const supabase = await createClient();
  let query = supabase.from("Paciente").select("id, nome, pacote").eq("ativo", true).order("nome");
  if (excluirId) query = query.neq("id", excluirId);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id", "pacote"]);
}

export async function verificarVinculosPaciente(id) {
  const supabase = await createClient();

  const [sessoes, recibos, recorrencias, dependentes] = await Promise.all([
    supabase.from("Sessao").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recibo").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recorrencia").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Paciente").select("nome").eq("responsavel_financeiro", id),
  ]);

  if (sessoes.error) throw new Error(sessoes.error.message);
  if (recibos.error) throw new Error(recibos.error.message);
  if (recorrencias.error) throw new Error(recorrencias.error.message);
  if (dependentes.error) throw new Error(dependentes.error.message);

  const vinculos = [];
  if (sessoes.count > 0) vinculos.push({ tipo: "sessão(ões)", quantidade: sessoes.count });
  if (recibos.count > 0) vinculos.push({ tipo: "recibo(s)", quantidade: recibos.count });
  if (recorrencias.count > 0) vinculos.push({ tipo: "recorrência(s)", quantidade: recorrencias.count });
  if (dependentes.data?.length > 0) {
    vinculos.push({ tipo: "é responsável financeiro de", nomes: dependentes.data.map((d) => d.nome) });
  }

  return vinculos;
}

export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, precisa_recibo, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro, ativo, ResponsavelFinanceiro:responsavel_financeiro(nome)"
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
    .select("id, data, horario, status, tipo_sessao")
    .eq("paciente", pacienteId)
    .order("data", { ascending: false })
    .order("horario", { ascending: false });

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}
