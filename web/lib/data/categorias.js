import { createClient } from "@/lib/supabase/server";
import { agruparCategorias } from "@/lib/blog";

export async function listarCategorias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, slug")
    .order("nome");

  if (error) throw new Error(error.message);
  return data;
}

export async function buscarCategoriaPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Só categorias que têm artigo publicado (com o total), em ordem alfabética:
// é o que o leitor vê nos filtros do blog. Uma linha da junção por par
// artigo x categoria; o inner join com `artigos` descarta rascunhos.
export async function listarCategoriasComArtigos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigo_categorias")
    .select("categorias(id, nome, slug), artigos!inner(publicado)")
    .eq("artigos.publicado", true);

  if (error) throw new Error(error.message);
  return agruparCategorias(data);
}
