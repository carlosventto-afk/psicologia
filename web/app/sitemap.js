import { sitemapSite } from "@/lib/seo";

// Só as páginas do domínio principal. Blog e busca têm o próprio sitemap
// (app/blog/sitemap.js e app/busca/sitemap.js), servido no host de cada um.
export default function sitemap() {
  return sitemapSite();
}
