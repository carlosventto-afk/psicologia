import { listarArtigosPublicados } from "@/lib/data/artigos";
import { sitemapBlog } from "@/lib/seo";

// Visto em blog.psiagente.com.br/sitemap.xml (o proxy prefixa com /blog).
export default async function sitemap() {
  const artigos = await listarArtigosPublicados();
  return sitemapBlog(artigos);
}
