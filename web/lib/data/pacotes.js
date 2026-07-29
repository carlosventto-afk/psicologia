import { createClient } from "@/lib/supabase/server";
import { listarTiposAtendimento, listarTiposCobranca } from "@/lib/data/lookups";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

// PacoteCobranca.dimensao_atendimento/dimensao_cobranca não têm FK declarada
// no banco (são bigint "soltos"), então o embed automático do PostgREST não
// funciona aqui — buscamos os lookups à parte e cruzamos manualmente.
export async function listarPacotes() {
  const supabase = await createClient();
  const [{ data, error }, tiposAtendimento, tiposCobranca] = await Promise.all([
    supabase
      .from("PacoteCobranca")
      .select("id, nome, forma_cobranca, valor_sugerido, dimensao_atendimento, dimensao_cobranca")
      .order("nome"),
    listarTiposAtendimento(),
    listarTiposCobranca(),
  ]);

  if (error) throw new Error(error.message);

  const nomeTipoAtendimento = Object.fromEntries(tiposAtendimento.map((t) => [t.id, t.Nome]));
  const nomeTipoCobranca = Object.fromEntries(tiposCobranca.map((t) => [t.id, t.Nome]));

  const camposId = ["id", "dimensao_atendimento", "dimensao_cobranca"];
  return data.map((pacote) => ({
    ...normalizarIds(pacote, camposId),
    tipo_atendimento_nome: nomeTipoAtendimento[pacote.dimensao_atendimento] ?? "—",
    tipo_cobranca_nome: nomeTipoCobranca[pacote.dimensao_cobranca] ?? "—",
  }));
}

export async function buscarPacote(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PacoteCobranca")
    .select("id, nome, forma_cobranca, valor_sugerido, dimensao_atendimento, dimensao_cobranca")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id", "dimensao_atendimento", "dimensao_cobranca"]);
}
