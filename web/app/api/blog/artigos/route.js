import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarSlug } from "@/lib/slugify";

async function vincularCategorias(admin, artigoId, categoriasSlugs) {
  const { data: categoriasEncontradas } = await admin
    .from("categorias")
    .select("id")
    .in("slug", categoriasSlugs);

  await admin.from("artigo_categorias").delete().eq("artigo_id", artigoId);

  if (categoriasEncontradas?.length > 0) {
    await admin.from("artigo_categorias").insert(
      categoriasEncontradas.map((c) => ({ artigo_id: artigoId, categoria_id: c.id }))
    );
  }
}

export async function POST(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { titulo, slug, resumo, conteudo, autor, publicado, imagem_capa_url } = body;
  const slugNormalizado = normalizarSlug(slug ?? "");

  if (!titulo || !slugNormalizado || !conteudo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Timestamp único computado uma vez e reaproveitado em todo _em desta
  // requisição (criado_em/atualizado_em/publicado_em) — evita depender do
  // relógio do servidor de banco (default now() do Postgres) e evita duas
  // chamadas separadas a Date.now() que poderiam, em tese, desalinhar
  // dateModified/datePublished no JSON-LD (achado da revisão final).
  const agora = new Date().toISOString();

  const { data: existente } = await admin
    .from("artigos")
    .select("id, publicado_em")
    .eq("slug", slugNormalizado)
    .maybeSingle();

  if (existente) {
    // Update parcial: só inclui no patch os campos opcionais que vieram
    // explicitamente no corpo da requisição. Uma chave omitida significa
    // "não mexer", não "limpar" — do contrário, um PATCH mínimo (ex.: só
    // corrigindo um typo em `conteudo`) apagaria capa/resumo/autor
    // existentes (achado da revisão final). `imagem_capa_url: null`
    // presente explicitamente continua sendo a forma legítima de remover
    // a capa via esta rota. Mesma convenção pra `categorias`.
    const patch = {
      titulo,
      slug: slugNormalizado,
      conteudo,
      atualizado_em: agora,
    };
    if ("resumo" in body) patch.resumo = resumo ?? null;
    if ("autor" in body) patch.autor = autor ?? null;
    if ("imagem_capa_url" in body) patch.imagem_capa = imagem_capa_url ?? null;
    if ("publicado" in body) {
      patch.publicado = publicado;
      if (publicado && !existente.publicado_em) {
        patch.publicado_em = agora;
      }
    }

    const { data, error } = await admin
      .from("artigos")
      .update(patch)
      .eq("id", existente.id)
      .select()
      .single();
    if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });

    if (Array.isArray(body.categorias)) {
      await vincularCategorias(admin, existente.id, body.categorias);
    }

    return Response.json({ success: true, data, acao: "atualizado" });
  }

  const dados = {
    titulo,
    slug: slugNormalizado,
    resumo: resumo ?? null,
    conteudo,
    autor: autor ?? null,
    publicado: publicado ?? false,
    imagem_capa: imagem_capa_url ?? null,
    criado_em: agora,
    atualizado_em: agora,
    publicado_em: publicado ? agora : null,
  };
  const { data, error } = await admin.from("artigos").insert(dados).select().single();
  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });

  if (Array.isArray(body.categorias) && body.categorias.length > 0) {
    await vincularCategorias(admin, data.id, body.categorias);
  }

  return Response.json({ success: true, data, acao: "criado" });
}
