import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client service-role — ignora RLS inteiramente. Só usar em código que já
// verificou explicitamente que quem está chamando é admin (não existe sessão
// de usuário aqui, então o RLS normal não tem como proteger nada sozinho).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
