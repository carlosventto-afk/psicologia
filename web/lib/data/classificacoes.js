import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarClassificacoes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ClassificacaoFinanceira")
    .select("id, nome, tipo")
    .order("nome");

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}
