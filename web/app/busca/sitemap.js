import { buscarPerfisPublicos } from "@/lib/data/diretorio";
import { sitemapBusca } from "@/lib/seo";

// Visto em busca.psiagente.com.br/sitemap.xml (o proxy prefixa com /busca).
export default async function sitemap() {
  const perfis = await buscarPerfisPublicos({});
  return sitemapBusca(perfis);
}
