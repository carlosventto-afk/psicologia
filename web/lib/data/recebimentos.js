import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarSessoesReceptiveis(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, valor, status, RecebimentoSessao(valor_aplicado)")
    .eq("paciente", pacienteId)
    .or("status.neq.Cancelada,status.is.null")
    .order("data")
    .order("horario");

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return {
        id: s.id,
        data: s.data,
        horario: s.horario,
        valor: Number(s.valor),
        valor_recebido: valorRecebido,
        saldo_devedor: Number(s.valor) - valorRecebido,
      };
    })
    .filter((s) => s.saldo_devedor > 0);
}

export async function calcularCreditoDisponivel(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Recebimento")
    .select("id, data_recebimento, valor_total, RecebimentoSessao(valor_aplicado)")
    .eq("paciente", pacienteId);

  if (error) throw new Error(error.message);

  const recebimentos = normalizarIdsLista(data, ["id"])
    .map((r) => {
      const valorAlocado = (r.RecebimentoSessao ?? []).reduce((soma, rs) => soma + Number(rs.valor_aplicado), 0);
      return {
        id: r.id,
        data_recebimento: r.data_recebimento,
        saldo: Number(r.valor_total) - valorAlocado,
      };
    })
    .filter((r) => r.saldo > 0)
    .sort((a, b) => (a.data_recebimento < b.data_recebimento ? -1 : 1));

  return {
    total: recebimentos.reduce((soma, r) => soma + r.saldo, 0),
    recebimentos,
  };
}
