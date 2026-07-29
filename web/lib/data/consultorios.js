import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarConsultorios() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Consultorio")
    .select("id, nome, telefone, email_atendimento")
    .order("nome");

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}

export async function buscarConsultorio(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Consultorio")
    .select("id, nome, endereco, telefone, email_atendimento")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id"]);
}
