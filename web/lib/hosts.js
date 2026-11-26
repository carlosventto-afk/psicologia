// Regras de host compartilhadas pelo proxy e pelas rotas de SEO. Módulo puro
// (sem imports do Next) para poder ser testado com `node --test`.

export const DOMINIO = "psiagente.com.br";

// Funil de venda pré-login no domínio principal — rastreado igual aos
// subdomínios públicos (ver deveRastrearVisita). Igualdade exata, não
// prefixo: mesmo cuidado já usado pra "/" no middleware de sessão, senão
// qualquer path prefixado indevidamente entraria no funil.
const PATHS_FUNIL = ["/", "/login", "/cadastro", "/completar-cadastro", "/esqueci-senha", "/comparativo"];

// Host sem porta e em minúsculas. IPv6 literal vem entre colchetes
// ("[::1]:3000"), então a porta é cortada depois do "]".
export function nomeDoHost(host) {
  const h = String(host ?? "").trim().toLowerCase();
  if (h.startsWith("[")) {
    const fim = h.indexOf("]");
    return fim === -1 ? h : h.slice(0, fim + 1);
  }
  return h.replace(/:\d+$/, "");
}

// "site" é tudo que não é subdomínio público (inclui host desconhecido).
export function classificarHost(host) {
  const nome = nomeDoHost(host);
  if (nome.startsWith("comece.")) return "comece";
  if (nome.startsWith("busca.")) return "busca";
  if (nome.startsWith("blog.")) return "blog";
  if (nome === `www.${DOMINIO}`) return "www";
  return "site";
}

// localhost (e seus subdomínios, que os navegadores resolvem sozinhos),
// loopback, 0.0.0.0 e acesso por IP puro: nenhum deles é visita de verdade ao
// produto, só desenvolvimento, teste local ou varredura de robô.
export function ehHostLocal(host) {
  const nome = nomeDoHost(host);
  if (!nome) return true;
  if (nome === "localhost" || nome.endsWith(".localhost")) return true;
  if (nome === "[::1]") return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(nome);
}

// Domínio de destino quando o host é o "www." do domínio principal; null nos
// demais casos. O www vira redirecionamento permanente: sem isso o Google
// rastreia o mesmo conteúdo em dois endereços.
export function destinoSemWww(host) {
  return nomeDoHost(host) === `www.${DOMINIO}` ? DOMINIO : null;
}

// Casa o prefixo de rota interna (/blog, /busca, /comece) pelo segmento
// inteiro. `startsWith("/blog")` pegava também "/blog-de-psicologia" e fazia o
// proxy deixar de prefixar o slug de um artigo cujo nome começa com "blog".
export function dentroDoPrefixo(pathname, prefixo) {
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

export function deveRastrearVisita(host, pathname) {
  if (ehHostLocal(host)) return false;
  const tipo = classificarHost(host);
  if (tipo === "comece" || tipo === "busca" || tipo === "blog") return true;
  return PATHS_FUNIL.includes(pathname);
}
