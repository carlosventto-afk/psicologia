import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarRecorrenciasDespesa() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("RecorrenciaDespesa")
    .select("id, descricao, valor, frequencia, data_inicio, gerado_ate")
    .eq("ativa", true)
    .order("data_inicio", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]);
}
