import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { caminhoInterno } from "@/lib/caminho-interno";
import CompletarPerfilForm from "@/components/CompletarPerfilForm";

export default async function PaginaCompletarPerfil({ searchParams }) {
  const params = await searchParams;
  const next = caminhoInterno(params.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarioExistente, error: erroUsuarios } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .maybeSingle();

  // Mesmo padrao do callback: falha aberta numa consulta com erro -- deixa
  // o formulario aparecer de novo em vez de arriscar redirecionar errado.
  // Reenviar o formulario pra quem ja tem linha em Usuarios cai no erro de
  // "nao foi possivel salvar" do lado da action, sem duplicar linha.
  if (!erroUsuarios && usuarioExistente) {
    redirect(next);
  }

  const nomeSugerido = user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";

  return <CompletarPerfilForm nomeSugerido={nomeSugerido} email={user.email} next={next} />;
}
