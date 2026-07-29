import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

// ContaFinanceira não tem coluna "consultorio" — é escopada só por owner
// (o psicólogo), assim como PacoteCobranca.
export async function listarContas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ContaFinanceira")
    .select("id, codigo, nome, banco, agencia, numero, tipo")
    .order("nome");

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}
