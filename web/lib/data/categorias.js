import { createClient } from "@/lib/supabase/server";

export async function listarCategorias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, slug")
    .order("nome");

  if (error) throw new Error(error.message);
  return data;
}
