import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function buscarAnamnese(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Anamnese")
    .select(
      "id, paciente, medicacao_em_uso, medico_responsavel, terapia_desde, atendido_desde, queixa_inicial, desenvolvimento_queixa, historico_familiar, tratamento_anterior, uso_substancias, hipotese_diagnostica, expectativas, atualizado_em"
    )
    .eq("paciente", pacienteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return normalizarIds(data, ["id", "paciente"]);
}

export async function listarFollowupsAnamnese(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("AnamneseFollowup")
    .select("id, criado_em, observacao, alteracoes, Anamnese!inner(paciente)")
    .eq("Anamnese.paciente", pacienteId)
    .order("criado_em", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map(({ Anamnese, ...followup }) => followup);
}
