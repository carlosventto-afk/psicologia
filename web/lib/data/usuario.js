import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarUsuarioAtual() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Usuarios")
    .select("id, nome, whatsapp_number, whatsapp_verified, role")
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id"]);
}
