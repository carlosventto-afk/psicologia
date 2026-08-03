import { notFound } from "next/navigation";
import { marked } from "marked";
import { buscarArtigoPublicadoPorSlug } from "@/lib/data/artigos";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) return {};

  const origem = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const url = `${origem}/${artigo.slug}`;

  return {
    title: artigo.titulo,
    description: artigo.resumo ?? undefined,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: artigo.titulo,
      description: artigo.resumo ?? undefined,
      type: "article",
      url,
    },
  };
}

export default async function PaginaArtigo({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) {
    notFound();
  }

  const html = marked.parse(artigo.conteudo);

  return (
    <article className="space-y-4">
      <div>
        <p className="text-xs text-muted">
          {new Date(artigo.publicado_em).toLocaleDateString("pt-BR")}
          {artigo.autor && ` · ${artigo.autor}`}
        </p>
        <h1 className="page-title mt-1">{artigo.titulo}</h1>
      </div>

      <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
