import { createClient } from "@/lib/supabase/server";

export async function listarArtigosPublicados() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, autor, publicado_em")
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function buscarArtigoPublicadoPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, conteudo, autor, publicado_em")
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listarArtigosAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, publicado, publicado_em, criado_em")
    .order("criado_em", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function buscarArtigoAdmin(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, conteudo, autor, publicado, publicado_em")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
