import { listarArtigosPublicados } from "@/lib/data/artigos";

export const revalidate = 3600;

export default async function sitemap() {
  const origem = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const artigos = await listarArtigosPublicados();

  return [
    {
      url: origem,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...artigos.map((a) => ({
      url: `${origem}/${a.slug}`,
      lastModified: a.publicado_em,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
  ];
}
