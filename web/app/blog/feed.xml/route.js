import { listarArtigosPublicadosPagina } from "@/lib/data/artigos";
import { DESCRICAO_BLOG, descricaoArtigo, montarRss, origens } from "@/lib/seo";

const ITENS = 30;

// Feed RSS dos 30 artigos mais recentes — visto em blog.psiagente.com.br/feed.xml
// (o proxy prefixa /blog). Leitores de feed, agregadores e alguns buscadores o
// usam para descobrir artigo novo sem esperar o rastreio.
export async function GET() {
  const o = origens();
  const artigos = await listarArtigosPublicadosPagina({ inicio: 0, fim: ITENS - 1 });

  const xml = montarRss({
    titulo: "Blog PsiAgente",
    descricao: DESCRICAO_BLOG,
    link: o.blog,
    linkFeed: `${o.blog}/feed.xml`,
    artigos: artigos.map((a) => ({
      titulo: a.titulo,
      url: `${o.blog}/${a.slug}`,
      resumo: descricaoArtigo(a),
      publicadoEm: a.publicado_em,
      categorias: a.categorias.map((c) => c.nome),
    })),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
