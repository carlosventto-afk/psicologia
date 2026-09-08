import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarAgenda({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, Realizado, valor, recorrencia_id, Paciente!inner(id, nome), RecebimentoSessao(valor_aplicado)"
    )
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .order("data")
    .order("horario");

  if (error) throw new Error(error.message);

  return data.map((s) => {
    const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    return normalizarIds(
      {
        id: s.id,
        data: s.data,
        horario: s.horario,
        duracao_min: s.duracao_min,
        status: s.status,
        tipo_sessao: s.tipo_sessao,
        realizado: s.Realizado,
        valor: Number(s.valor),
        pago: valorRecebido >= Number(s.valor),
        recorrencia_id: s.recorrencia_id,
        paciente_id: s.Paciente.id,
        paciente_nome: s.Paciente.nome,
      },
      ["id", "paciente_id", "recorrencia_id"]
    );
  });
}

// Quantidade e valor total das sessões marcadas/realizadas no período
// (exclui canceladas) — usado nos contadores de resumo da Agenda.
export async function resumoAgenda({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("valor")
    .or("status.neq.Cancelada,status.is.null")
    .gte("data", dataInicio)
    .lte("data", dataFim);

  if (error) throw new Error(error.message);

  return {
    quantidade: data.length,
    valor: data.reduce((soma, s) => soma + Number(s.valor || 0), 0),
  };
}

export async function buscarSessao(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, anotacoes, Realizado, valor, recorrencia_id, Paciente!inner(id, nome)"
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
      valor: Number(data.valor),
      recorrencia_id: data.recorrencia_id,
      paciente_id: data.Paciente.id,
      paciente_nome: data.Paciente.nome,
    },
    ["id", "paciente_id", "recorrencia_id"]
  );
}
