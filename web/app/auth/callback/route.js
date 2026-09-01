import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const user = data?.user;

      if (!user) {
        return NextResponse.redirect(`${origin}/login`);
      }

      const { data: usuarioExistente, error: erroUsuarios } = await supabase
        .from("Usuarios")
        .select("id")
        .eq("id_user", user.id)
        .maybeSingle();

      // Falha aberta: se a consulta em si der erro (RLS, rede, etc.), nao
      // tratamos como "usuario precisa completar perfil" -- deixa seguir
      // pro destino normal. (app)/layout.js redireciona pra
      // /completar-perfil se a linha realmente nao existir (ver
      // buscarUsuarioAtual), entao uma consulta com erro aqui so custa um
      // passo a mais, nunca trava o usuario.
      if (!erroUsuarios && !usuarioExistente) {
        return NextResponse.redirect(`${origin}/completar-perfil?next=${encodeURIComponent(next)}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
