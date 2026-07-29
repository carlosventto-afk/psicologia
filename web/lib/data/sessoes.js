import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarAgenda({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, Realizado, Paciente!inner(id, nome, valor_sessao), PagamentoSessao(id)"
    )
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .order("data")
    .order("horario");

  if (error) throw new Error(error.message);

  return data.map((s) =>
    normalizarIds(
      {
        id: s.id,
        data: s.data,
        horario: s.horario,
        duracao_min: s.duracao_min,
        status: s.status,
        tipo_sessao: s.tipo_sessao,
        realizado: s.Realizado,
        pago: (s.PagamentoSessao?.length ?? 0) > 0,
        paciente_id: s.Paciente.id,
        paciente_nome: s.Paciente.nome,
        valor_sessao: s.Paciente.valor_sessao,
      },
      ["id", "paciente_id"]
    )
  );
}

export async function buscarSessao(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, anotacoes, Realizado, Paciente!inner(id, nome, valor_sessao)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  return normalizarIds(
    {
      id: data.id,
      data: data.data,
      horario: data.horario,
      duracao_min: data.duracao_min,
      status: data.status,
      tipo_sessao: data.tipo_sessao,
      anotacoes: data.anotacoes,
      realizado: data.Realizado,
      paciente_id: data.Paciente.id,
      paciente_nome: data.Paciente.nome,
      valor_sessao: data.Paciente.valor_sessao,
    },
    ["id", "paciente_id"]
  );
}
