import { createClient } from "@/lib/supabase/server";

export async function listarTiposAtendimento() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("TipoAtendimento")
    .select('id, "Nome", "Codigo"')
    .order("Codigo");

  if (error) throw new Error(error.message);
  return data;
}

export async function listarTiposCobranca() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("TipoCobranca")
    .select('id, "Nome", "Codigo"')
    .order("Codigo");

  if (error) throw new Error(error.message);
  return data;
}
