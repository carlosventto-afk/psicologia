import { notFound } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import JsonLd from "@/components/JsonLd";
import LeiaTambem from "@/components/blog/LeiaTambem";
import { buscarArtigoPublicadoPorSlug, listarArtigosResumo } from "@/lib/data/artigos";
import { escolherRelacionados } from "@/lib/blog";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";
import {
  alternativasBlog,
  descricaoArtigo,
  imagemDoArtigo,
  jsonLdArtigo,
  jsonLdBreadcrumb,
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

  // Dados estruturados: o artigo (com publisher, imagem — a mesma do
  // compartilhamento, rich snippets também não ficam sem imagem — e datas) e a
  // trilha Blog > categoria > artigo. Montados em lib/seo.js (testado).
  const o = origens();
  const url = `${o.blog}/${artigo.slug}`;
  const imagem = imagemDoArtigo(artigo, o);
  const categoria = artigo.categorias[0];
  const dadosEstruturados = [
    jsonLdArtigo(artigo, { url, imagem: typeof imagem === "string" ? imagem : imagem.url }, o),
    jsonLdBreadcrumb([
      { nome: "Blog", url: o.blog },
      ...(categoria ? [{ nome: categoria.nome, url: `${o.blog}/categoria/${categoria.slug}` }] : []),
      { nome: artigo.titulo, url },
    ]),
  ];

  return (
    <>
    <article className="space-y-4">
      {dadosEstruturados.map((dados, i) => (
        <JsonLd key={i} dados={dados} />
      ))}

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
