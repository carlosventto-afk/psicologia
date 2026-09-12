import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { continuarFluxoWhatsapp } from "@/lib/whatsapp-onboarding-callback";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/painel";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await continuarFluxoWhatsapp(data?.user?.id ?? data?.session?.user?.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
