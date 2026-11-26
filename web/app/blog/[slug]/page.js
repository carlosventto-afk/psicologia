import { notFound } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import LeiaTambem from "@/components/blog/LeiaTambem";
import { buscarArtigoPublicadoPorSlug, listarArtigosResumo } from "@/lib/data/artigos";
import { escolherRelacionados } from "@/lib/blog";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";
import {
  alternativasBlog,
  descricaoArtigo,
  imagemDoArtigo,
  montarCompartilhamento,
  origens,
} from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) return {};

  const url = `${origens().blog}/${artigo.slug}`;
  const descricao = descricaoArtigo(artigo);
  // Capa do artigo; sem capa, o cartão com o título — nunca deixar o
  // compartilhamento sem imagem (exigência explícita do spec).
  const imagens = [imagemDoArtigo(artigo)];

  return {
    title: artigo.titulo,
    description: descricao,
    alternates: alternativasBlog(url),
    ...montarCompartilhamento({
      titulo: artigo.titulo,
      descricao,
      url,
      tipo: "article",
      imagens,
      extras: {
        publishedTime: artigo.publicado_em,
        modifiedTime: artigo.atualizado_em ?? artigo.publicado_em,
        section: artigo.categorias[0]?.nome,
        tags: artigo.categorias.map((c) => c.nome),
      },
    }),
  };
}

export default async function PaginaArtigo({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) {
    notFound();
  }

  const html = marked.parse(artigo.conteudo);
  const tempoLeitura = calcularTempoLeitura(artigo.conteudo);
  const relacionados = escolherRelacionados(artigo, await listarArtigosResumo(), 3);

  const origem = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  // Mesmo fallback do Open Graph (ver generateMetadata acima): rich
  // snippets também não devem ficar sem imagem.
  const imagemJsonLd = artigo.imagem_capa ?? `${origem}/og-default.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: artigo.titulo,
    description: artigo.resumo ?? undefined,
    image: imagemJsonLd,
    datePublished: artigo.publicado_em,
    dateModified: artigo.atualizado_em ?? artigo.publicado_em,
    author: artigo.autor ? { "@type": "Person", name: artigo.autor } : undefined,
  };
  // Escapa "<" pra evitar que um título/resumo/autor contendo "</script>"
  // feche a tag prematuramente durante o parse HTML inicial (JSON.stringify
  // não escapa "<" por padrão). < é um escape JSON/JS válido — o
  // parser de JSON-LD (e o crawler que consome a tag) interpreta de volta
  // como "<" normalmente.
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <>
    <article className="space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />

      {artigo.imagem_capa && (
        <img
          src={artigo.imagem_capa}
          alt={artigo.titulo}
          className="w-full h-64 object-cover rounded-2xl"
        />
      )}

      <div>
        <p className="text-xs text-muted">
          {new Date(artigo.publicado_em).toLocaleDateString("pt-BR")}
          {artigo.autor && ` · ${artigo.autor}`}
          {` · ${tempoLeitura} min de leitura`}
        </p>
        <h1 className="page-title mt-1">{artigo.titulo}</h1>
        {artigo.categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {artigo.categorias.map((c) => (
              <Link key={c.slug} href={`/categoria/${c.slug}`} className="blog-categoria-badge">
                {c.nome}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
    </article>

    <LeiaTambem artigos={relacionados} />
    </>
  );
}
