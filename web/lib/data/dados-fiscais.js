import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarDadosFiscais() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("DadosFiscaisProfissional")
    .select("*")
    .eq("owner", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizarIds(data, ["id"]) : null;
}
