import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import CategoriasBlog from "@/components/blog/CategoriasBlog";
import ListaArtigos from "@/components/blog/ListaArtigos";
import { contarArtigosPublicados, listarArtigosPublicadosPagina } from "@/lib/data/artigos";
import { listarCategoriasComArtigos } from "@/lib/data/categorias";
import { POR_PAGINA, numeroDaPagina, paginar } from "@/lib/blog";
import {
  DESCRICAO_BLOG,
  IMAGEM_PADRAO,
  alternativasBlog,
  jsonLdBlog,
  montarCompartilhamento,
} from "@/lib/seo";

export async function generateMetadata({ searchParams }) {
  const { categoria, pagina } = await searchParams;
  // O endereço antigo das categorias (/?categoria=x) redireciona; não há o que descrever.
  if (categoria) return {};

  const n = numeroDaPagina(pagina);
  // Cada página tem canonical próprio: apontar todas para a primeira esconderia os artigos das demais.
  const caminho = n > 1 ? `/?pagina=${n}` : "/";
  const titulo = n > 1 ? `Blog PsiAgente — página ${n}` : "Blog PsiAgente";

  return {
    ...(n > 1 ? { title: `Página ${n}` } : {}),
    description: DESCRICAO_BLOG,
    alternates: alternativasBlog(caminho),
    ...montarCompartilhamento({ titulo, descricao: DESCRICAO_BLOG, url: caminho, imagens: [IMAGEM_PADRAO] }),
  };
}

export default async function PaginaBlog({ searchParams }) {
  const { categoria, pagina: paginaParam } = await searchParams;

  // Endereço antigo das categorias (/?categoria=x): vai, de forma permanente,
  // para a página própria (/categoria/x) — quem tinha o link salvo e o Google
  // chegam ao mesmo lugar.
  if (categoria) permanentRedirect(`/categoria/${encodeURIComponent(categoria)}`);

  const total = await contarArtigosPublicados();
  const paginacao = paginar(total, paginaParam, POR_PAGINA);
  // Página fora do intervalo ou mal formada: 404, em vez de repetir a lista numa URL diferente.
  if (!paginacao.valida) notFound();

  const [artigos, categorias] = await Promise.all([
    listarArtigosPublicadosPagina({ inicio: paginacao.inicio, fim: paginacao.fim }),
    listarCategoriasComArtigos(),
  ]);

  return (
    <div className="space-y-10">
      <JsonLd dados={jsonLdBlog()} />
      <div>
        <h1 className="page-title mb-2">Blog PsiAgente</h1>
        <p className="text-muted mb-5">{DESCRICAO_BLOG}</p>

        <CategoriasBlog categorias={categorias} />

        <ListaArtigos
          artigos={artigos}
          paginacao={paginacao}
          caminhoBase="/"
          vazio="Nenhum artigo publicado ainda."
        />
      </div>
    </div>
  );
}
