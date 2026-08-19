import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// "/blog" não entra aqui: requisições em blog.psiagente.com.br nunca chegam
// a este arquivo (web/proxy.js resolve antes), e "/blog" no domínio
// principal é redirecionado pro subdomínio antes de chegar aqui também.
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
  "/carne-leao-automatico",
  "/api/agent/call-tool",
];

export async function updateSession(request) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
