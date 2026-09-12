import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { createAdminClient } from "@/lib/supabase/admin";

const OLD_DOMAIN = "psifacil.com.br";
const NEW_DOMAIN = "psiagente.com.br";
const BLOG_HOST = "blog.psiagente.com.br";

// Funil de venda pré-login no domínio principal — rastreado igual aos
// subdomínios públicos (ver deveRastrear). Igualdade exata, não prefixo:
// mesmo cuidado já usado pra "/" no middleware de sessão, senão qualquer
// path prefixado indevidamente entraria no funil.
const PATHS_FUNIL = ["/", "/login", "/cadastro", "/completar-cadastro", "/esqueci-senha"];

function deveRastrear(host, pathname) {
  if (host.startsWith("comece.") || host.startsWith("busca.") || host.startsWith("blog.")) {
    return true;
  }
  return PATHS_FUNIL.includes(pathname);
}

function obterSessaoVisitante(request) {
  const existente = request.cookies.get("pv_id")?.value;
  if (existente) return { sessaoId: existente, novo: false };
  return { sessaoId: crypto.randomUUID(), novo: true };
}

function comCookieVisitante(response, sessaoId, novo) {
  if (novo) {
    response.cookies.set("pv_id", sessaoId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}

// Web Crypto (não o módulo "crypto" do Node) -- funciona tanto em Edge
// quanto em Node 18+, sem depender de qual runtime o middleware roda
// neste deploy self-hosted.
async function hashIp(ip) {
  if (!ip) return null;
  const dados = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Rastreamento de pageview pro funil de vendas (item 24 do backlog) --
// nunca pode atrasar nem derrubar a navegação, por isso o try/catch
// silencioso. Insert aguardado (não fire-and-forget): é uma tabela sem
// índice pesado, custo de latência aceitável, evita depender de after()
// funcionar de forma confiável dentro de middleware neste deploy.
async function registrarVisita(request, sessaoId) {
  try {
    const admin = createAdminClient();
    const ipBruto = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await admin.from("VisitaPagina").insert({
      sessao_id: sessaoId,
      host: request.headers.get("host") ?? "",
      path: request.nextUrl.pathname,
      referrer: request.headers.get("referer"),
      utm_source: request.nextUrl.searchParams.get("utm_source"),
      utm_medium: request.nextUrl.searchParams.get("utm_medium"),
      utm_campaign: request.nextUrl.searchParams.get("utm_campaign"),
      utm_term: request.nextUrl.searchParams.get("utm_term"),
      utm_content: request.nextUrl.searchParams.get("utm_content"),
      ip_hash: await hashIp(ipBruto),
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    // Rastreamento nunca pode derrubar a navegação.
  }
}

export async function proxy(request) {
  const host = request.headers.get("host") ?? "";
  const { sessaoId, novo } = obterSessaoVisitante(request);

  // Domínio antigo (psifacil.com.br e qualquer subdomínio dele) redireciona
  // pro domínio novo, de forma permanente — protege link salvo, e-mail já
  // enviado e SEO acumulado durante a troca de marca. Não rastreado aqui:
  // o destino final do redirect é rastreado na requisição seguinte.
  if (host === OLD_DOMAIN || host.endsWith(`.${OLD_DOMAIN}`)) {
    const url = request.nextUrl.clone();
    url.host = host.replace(OLD_DOMAIN, NEW_DOMAIN);
    url.port = "";
    return comCookieVisitante(NextResponse.redirect(url, 308), sessaoId, novo);
  }

  // Sem Next-Router-Prefetch: exclui prefetch especulativo de <Link> no
  // viewport, que ainda não é visita de verdade. RSC de navegação real
  // (clique de verdade em <Link>, transição client-side) continua contado
  // -- excluir por esse header perderia a maioria dos cliques dentro do
  // site, já que só o primeiro carregamento de página é documento completo.
  if (
    request.method === "GET" &&
    !request.headers.get("next-router-prefetch") &&
    deveRastrear(host, request.nextUrl.pathname)
  ) {
    await registrarVisita(request, sessaoId);
  }

  // comece.psiagente.com.br: landing page paga, reescreve tudo pra /comece
  // (página única) — mesmo raciocínio do blog, nunca passa pelo
  // updateSession.
  if (host.startsWith("comece.")) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/comece")) {
      url.pathname = `/comece${url.pathname}`;
    }
    return comCookieVisitante(NextResponse.rewrite(url), sessaoId, novo);
  }

  // busca.psiagente.com.br: diretório público de psicólogos, reescreve
  // tudo pra /busca — mesmo raciocínio do blog/landing, nunca passa pelo
  // updateSession.
  if (host.startsWith("busca.")) {
    const url = request.nextUrl.clone();
    const isMetadataFile = url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt";
    // sitemap.js/robots.js só existem na raiz do app (não têm convenção
    // aninhada por segmento) — não prefixar, senão viram /busca/sitemap.xml
    // e dão 404.
    if (!isMetadataFile && !url.pathname.startsWith("/busca")) {
      url.pathname = `/busca${url.pathname}`;
    }
    return comCookieVisitante(NextResponse.rewrite(url), sessaoId, novo);
  }

  // blog.psiagente.com.br: reescreve pra dentro de /blog/... (invisível pro
  // navegador) e nunca passa pelo updateSession — é conteúdo público, não
  // precisa criar client do Supabase pra checar sessão a cada pageview.
  if (host.startsWith("blog.")) {
    const url = request.nextUrl.clone();
    const isMetadataFile = url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt";
    // sitemap.js/robots.js só existem na raiz do app (não têm convenção
    // aninhada por segmento) — não prefixar, senão viram /blog/sitemap.xml
    // e dão 404.
    if (!isMetadataFile && !url.pathname.startsWith("/blog")) {
      url.pathname = `/blog${url.pathname}`;
    }
    return comCookieVisitante(NextResponse.rewrite(url), sessaoId, novo);
  }

  // Links antigos pro blog no domínio principal (psiagente.com.br/blog...)
  // redirecionam pro subdomínio novo, de forma permanente.
  if (request.nextUrl.pathname.startsWith("/blog")) {
    const url = request.nextUrl.clone();
    url.host = BLOG_HOST;
    url.port = "";
    url.pathname = url.pathname.replace(/^\/blog/, "") || "/";
    return comCookieVisitante(NextResponse.redirect(url, 308), sessaoId, novo);
  }

  return comCookieVisitante(await updateSession(request), sessaoId, novo);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
