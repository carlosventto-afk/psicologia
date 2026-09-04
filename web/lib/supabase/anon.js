import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client stateless com a chave anon -- usado só por rotas de API chamadas
// por integrações externas (n8n), nunca por Server Components/Actions
// (que devem usar web/lib/supabase/server.js, cookie-based). Precisa da
// chave anon (não service-role) porque auth.signInWithOtp é uma operação
// pública do GoTrue, e usar o client admin aqui misturaria os dois papéis
// sem necessidade.
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
