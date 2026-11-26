import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import CategoriasBlog from "@/components/blog/CategoriasBlog";
import ListaArtigos from "@/components/blog/ListaArtigos";
import { contarArtigosPublicados, listarArtigosPublicadosPagina } from "@/lib/data/artigos";
import { buscarCategoriaPorSlug, listarCategoriasComArtigos } from "@/lib/data/categorias";
import { MIN_ARTIGOS_CATEGORIA, POR_PAGINA, numeroDaPagina, paginar } from "@/lib/blog";
import {
  IMAGEM_PADRAO,
  alternativasBlog,
  jsonLdBreadcrumb,
  montarCompartilhamento,
  origens,
} from "@/lib/seo";

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const { pagina } = await searchParams;
  const categoria = await buscarCategoriaPorSlug(slug);
  if (!categoria) return {};

  const total = await contarArtigosPublicados(categoria.id);
  const n = numeroDaPagina(pagina);
  const caminho = `/categoria/${categoria.slug}${n > 1 ? `?pagina=${n}` : ""}`;
  const descricao = `Artigos do blog do PsiAgente sobre ${categoria.nome}.`;

  return {
    title: n > 1 ? `${categoria.nome} — página ${n}` : categoria.nome,
    description: descricao,
    alternates: alternativasBlog(caminho),
    // Categoria com poucos artigos só repetiria o que já está nos artigos:
    // existe para o leitor, mas fica fora do índice.
    ...(total < MIN_ARTIGOS_CATEGORIA ? { robots: { index: false, follow: true } } : {}),
    ...montarCompartilhamento({
      titulo: `${categoria.nome} · Blog PsiAgente`,
      descricao,
      url: caminho,
      imagens: [IMAGEM_PADRAO],
    }),
  };
}

export default async function PaginaCategoria({ params, searchParams }) {
  const { slug } = await params;
  const { pagina: paginaParam } = await searchParams;

  const categoria = await buscarCategoriaPorSlug(slug);
  if (!categoria) notFound();

  const total = await contarArtigosPublicados(categoria.id);
  const paginacao = paginar(total, paginaParam, POR_PAGINA);
  if (!paginacao.valida) notFound();

  const [artigos, categorias] = await Promise.all([
    listarArtigosPublicadosPagina({ categoriaId: categoria.id, inicio: paginacao.inicio, fim: paginacao.fim }),
    listarCategoriasComArtigos(),
  ]);

  const o = origens();
  const trilha = jsonLdBreadcrumb([
    { nome: "Blog", url: o.blog },
    { nome: categoria.nome, url: `${o.blog}/categoria/${categoria.slug}` },
  ]);

  return (
    <div className="space-y-10">
      <JsonLd dados={trilha} />
      <div>
        <h1 className="page-title mb-2">{categoria.nome}</h1>
        <p className="text-muted mb-5">Artigos do blog do PsiAgente sobre {categoria.nome}.</p>

        <CategoriasBlog categorias={categorias} ativa={categoria.slug} />

        <ListaArtigos
          artigos={artigos}
          paginacao={paginacao}
          caminhoBase={`/categoria/${categoria.slug}`}
          vazio="Nenhum artigo publicado nessa categoria ainda."
        />
      </div>
    </div>
  );
}
