import { createClient } from "@/lib/supabase/server";

const EMBED_CATEGORIAS = "artigo_categorias(categorias(nome, slug))";
// Sem `conteudo`: para quem só precisa de título, resumo, datas e categorias
// (sitemap, "leia também"), sem carregar o texto de todos os artigos.
const COLUNAS_RESUMO = `id, titulo, slug, resumo, autor, publicado_em, atualizado_em, imagem_capa, ${EMBED_CATEGORIAS}`;
const COLUNAS_LISTA = `id, titulo, slug, resumo, conteudo, autor, publicado_em, atualizado_em, imagem_capa, ${EMBED_CATEGORIAS}`;

function comCategorias(artigo) {
  return {
    ...artigo,
    categorias: (artigo.artigo_categorias || []).map((ac) => ac.categorias),
  };
}

// Ids dos artigos de uma categoria; null quando não há filtro de categoria.
async function idsDaCategoria(supabase, categoriaId) {
  if (!categoriaId) return null;
  const { data, error } = await supabase
    .from("artigo_categorias")
    .select("artigo_id")
    .eq("categoria_id", categoriaId);
  if (error) throw new Error(error.message);
  return data.map((v) => v.artigo_id);
}

export async function contarArtigosPublicados(categoriaId) {
  const supabase = await createClient();
  const ids = await idsDaCategoria(supabase, categoriaId);
  if (ids && ids.length === 0) return 0;

  let query = supabase.from("artigos").select("id", { count: "exact", head: true }).eq("publicado", true);
  if (ids) query = query.in("id", ids);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Uma página da listagem (mais recentes primeiro). `inicio`/`fim` são índices
// base 0 inclusivos (ver `paginar` em lib/blog.js). O `id` desempata artigos
// publicados no mesmo instante, para que a ordem não mude entre páginas.
export async function listarArtigosPublicadosPagina({ categoriaId, inicio, fim }) {
  const supabase = await createClient();
  const ids = await idsDaCategoria(supabase, categoriaId);
  if (ids && ids.length === 0) return [];

  let query = supabase
    .from("artigos")
    .select(COLUNAS_LISTA)
    .eq("publicado", true)
    .order("publicado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(inicio, fim);
  if (ids) query = query.in("id", ids);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(comCategorias);
}

export async function listarArtigosResumo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select(COLUNAS_RESUMO)
    .eq("publicado", true)
    .order("publicado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);
  return data.map(comCategorias);
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
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado, publicado_em, imagem_capa, artigo_categorias(categoria_id)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return {
    ...data,
    categoria_ids: (data.artigo_categorias || []).map((ac) => ac.categoria_id),
  };
}
