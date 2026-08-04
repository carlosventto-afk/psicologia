import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const BLOG_HOST = "blog.psifacil.com.br";

export async function proxy(request) {
  const host = request.headers.get("host") ?? "";

  // comece.psifacil.com.br: landing page paga, reescreve tudo pra /comece
  // (página única) — mesmo raciocínio do blog, nunca passa pelo
  // updateSession.
  if (host.startsWith("comece.")) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/comece")) {
      url.pathname = `/comece${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // busca.psifacil.com.br: diretório público de psicólogos, reescreve
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
    return NextResponse.rewrite(url);
  }

  // blog.psifacil.com.br: reescreve pra dentro de /blog/... (invisível pro
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
    return NextResponse.rewrite(url);
  }

  // Links antigos pro blog no domínio principal (psifacil.com.br/blog...)
  // redirecionam pro subdomínio novo, de forma permanente.
  if (request.nextUrl.pathname.startsWith("/blog")) {
    const url = request.nextUrl.clone();
    url.host = BLOG_HOST;
    url.port = "";
    url.pathname = url.pathname.replace(/^\/blog/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
