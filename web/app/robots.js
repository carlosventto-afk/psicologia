import { headers } from "next/headers";
import { robotsParaHost } from "@/lib/seo";

// Um robots.txt por host: o proxy deixa /robots.txt passar sem prefixo nos
// subdomínios, então a mesma rota atende site, blog e busca e escolhe o
// conteúdo pelo Host da requisição.
export default async function robots() {
  const cabecalhos = await headers();
  return robotsParaHost(cabecalhos.get("host"));
}
