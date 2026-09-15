import { createClient } from "@/lib/supabase/server";

export async function listarArtigosPublicados(categoriaSlug) {
  const supabase = await createClient();

  let idsFiltrados = null;
  if (categoriaSlug) {
    const { data: categoria } = await supabase
      .from("categorias")
      .select("id")
      .eq("slug", categoriaSlug)
      .maybeSingle();

    if (!categoria) return [];

    const { data: vinculos, error: erroVinculos } = await supabase
      .from("artigo_categorias")
      .select("artigo_id")
      .eq("categoria_id", categoria.id);

    if (erroVinculos) throw new Error(erroVinculos.message);
    idsFiltrados = vinculos.map((v) => v.artigo_id);
    if (idsFiltrados.length === 0) return [];
  }

  let query = supabase
    .from("artigos")
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado_em, imagem_capa, artigo_categorias(categorias(nome, slug))"
    )
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  if (idsFiltrados) query = query.in("id", idsFiltrados);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data.map((a) => ({
    ...a,
    categorias: (a.artigo_categorias || []).map((ac) => ac.categorias),
  }));
}

export async function buscarArtigoPublicadoPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado_em, atualizado_em, imagem_capa, artigo_categorias(categorias(nome, slug))"
    )
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    categorias: (data.artigo_categorias || []).map((ac) => ac.categorias),
  };
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
    .select("id, titulo, slug, resumo, conteudo, autor, publicado, publicado_em, imagem_capa")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
