import { listarArtigosPublicados } from "@/lib/data/artigos";
import { buscarPerfisPublicos } from "@/lib/data/diretorio";

export const revalidate = 3600;

export default async function sitemap() {
  const origemBlog = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const origemBusca = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  const [artigos, perfis] = await Promise.all([
    listarArtigosPublicados(),
    buscarPerfisPublicos({}),
  ]);

  return [
    {
      url: origemBlog,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...artigos.map((a) => ({
      url: `${origemBlog}/${a.slug}`,
      lastModified: a.publicado_em,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
    {
      url: origemBusca,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...perfis.map((p) => ({
      url: `${origemBusca}/${p.slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
    })),
  ];
}
