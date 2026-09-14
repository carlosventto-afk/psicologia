import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

// Soma de Sessao.valor das sessões marcadas/realizadas no período — é o
// valor "provisório" (sessões futuras de recorrência entram aqui até
// serem realizadas e viram um LancamentoFinanceiro de verdade).
export async function calcularPrevisto({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("Sessao")
    .select("valor")
    .eq("owner", user.id)
    .or("status.neq.Cancelada,status.is.null")
    .gte("data", dataInicio)
    .lte("data", dataFim);

  if (error) throw new Error(error.message);

  return data.reduce((soma, s) => soma + Number(s.valor || 0), 0);
}

export async function resumoDoMes(mesReferencia) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("v_resumo_financeiro_mensal")
    .select("total_receita, total_despesa, saldo_mes")
    .eq("mes_referencia", mesReferencia)
    .eq("owner", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? { total_receita: 0, total_despesa: 0, saldo_mes: 0 };
}

// Sessao realizada com soma de RecebimentoSessao.valor_aplicado menor que
// Sessao.valor (quitação parcial ou nenhuma) — substitui a antiga regra
// baseada em existência de PagamentoSessao.
export async function listarInadimplentes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, valor, Paciente!inner(id, nome, apelido), RecebimentoSessao(valor_aplicado)"
    )
    .eq("owner", user.id)
    .eq("Realizado", true)
    .order("data");

  if (error) throw new Error(error.message);

  return data
    .map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return { ...s, saldo_devedor: Number(s.valor) - valorRecebido };
    })
    .filter((s) => s.saldo_devedor > 0)
    .map((s) =>
      normalizarIds(
        {
          sessao_id: s.id,
          data: s.data,
          paciente_id: s.Paciente.id,
          paciente_nome: formatarNomePaciente(s.Paciente.nome, s.Paciente.apelido),
          valor_devido: s.saldo_devedor,
        },
        ["sessao_id", "paciente_id"]
      )
    );
}
