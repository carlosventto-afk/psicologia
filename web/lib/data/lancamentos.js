import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarLancamentos({ contaId, tipo, classificacaoId, dataInicio, dataFim } = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("LancamentoFinanceiro")
    .select(
      "id, data, descricao, valor, tipo, conta, classificacao, ContaFinanceira(nome), ClassificacaoFinanceira(nome)"
    )
    .order("data", { ascending: false });

  if (contaId) query = query.eq("conta", contaId);
  if (tipo) query = query.eq("tipo", tipo);
  if (classificacaoId) query = query.eq("classificacao", classificacaoId);
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data.map((l) =>
    normalizarIds(
      {
        ...l,
        conta_nome: l.ContaFinanceira?.nome ?? "—",
        classificacao_nome: l.ClassificacaoFinanceira?.nome ?? "—",
      },
      ["id", "conta", "classificacao"]
    )
  );
}

export async function buscarLancamento(id) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("LancamentoFinanceiro")
    .select("id, data, descricao, valor, tipo, conta, classificacao")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  return normalizarIds({ ...data, data: String(data.data).slice(0, 10) }, ["id", "conta", "classificacao"]);
}
