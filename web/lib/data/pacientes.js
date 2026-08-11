import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarPacientes({ busca = "" } = {}) {
  const supabase = await createClient();

  let query = supabase.from("Paciente").select("id, nome, telefone, email, valor_sessao").order("nome");

  if (busca) query = query.ilike("nome", `%${busca}%`);

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
  let query = supabase.from("Paciente").select("id, nome, pacote").order("nome");
  if (excluirId) query = query.neq("id", excluirId);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id", "pacote"]);
}

export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, precisa_recibo, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  let responsavel_nome = null;
  if (data.responsavel_financeiro) {
    const { data: responsavel } = await supabase
      .from("Paciente")
      .select("nome")
      .eq("id", data.responsavel_financeiro)
      .single();
    responsavel_nome = responsavel?.nome ?? null;
  }

  const normalizado = normalizarIds(data, ["id", "consultorio", "pacote", "responsavel_financeiro"]);
  return {
    ...normalizado,
    responsavel_nome,
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
