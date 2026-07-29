import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

// Soma de Paciente.valor_sessao das sessões marcadas/realizadas no período —
// é o valor "provisório" (sessões futuras de recorrência entram aqui até
// serem realizadas e viram um LancamentoFinanceiro de verdade).
export async function calcularPrevisto({ dataInicio, dataFim }) {
  const supabase = await createClient();
  // status <> 'Cancelada' exclui sessões com status nulo (dado legado) por
  // causa do NULL de SQL — por isso o or() explícito incluindo status nulo.
  const { data, error } = await supabase
    .from("Sessao")
    .select("Paciente!inner(valor_sessao)")
    .or("status.neq.Cancelada,status.is.null")
    .gte("data", dataInicio)
    .lte("data", dataFim);

  if (error) throw new Error(error.message);

  return data.reduce((soma, s) => soma + Number(s.Paciente?.valor_sessao || 0), 0);
}

export async function resumoDoMes(mesReferencia) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_resumo_financeiro_mensal")
    .select("total_receita, total_despesa, saldo_mes")
    .eq("mes_referencia", mesReferencia)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? { total_receita: 0, total_despesa: 0, saldo_mes: 0 };
}

// Mesma regra de negócio da RPC agent_listar_inadimplentes do agente de
// WhatsApp (sessão realizada sem PagamentoSessao vinculado), só que rodando
// sob RLS (authenticated) em vez de service_role.
export async function listarInadimplentes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, Paciente!inner(id, nome, valor_sessao), PagamentoSessao(id)")
    .eq("Realizado", true)
    .order("data");

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.PagamentoSessao?.length ?? 0) === 0)
    .map((s) =>
      normalizarIds(
        {
          sessao_id: s.id,
          data: s.data,
          paciente_id: s.Paciente.id,
          paciente_nome: s.Paciente.nome,
          valor_devido: s.Paciente.valor_sessao,
        },
        ["sessao_id", "paciente_id"]
      )
    );
}
