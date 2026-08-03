import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const BLOG_HOST = "blog.psifacil.com.br";

export async function proxy(request) {
  const host = request.headers.get("host") ?? "";

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
