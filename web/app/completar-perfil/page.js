import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompletarPerfilForm from "@/components/CompletarPerfilForm";

export default async function PaginaCompletarPerfil({ searchParams }) {
  const params = await searchParams;
  const next = params.next || "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarioExistente } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .maybeSingle();

  if (usuarioExistente) {
    redirect(next);
  }

  const nomeSugerido = user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";

  return <CompletarPerfilForm nomeSugerido={nomeSugerido} email={user.email} next={next} />;
}
