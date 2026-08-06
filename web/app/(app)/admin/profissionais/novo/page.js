import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import ConvidarProfissionalForm from "@/components/ConvidarProfissionalForm";
import { convidarProfissional } from "@/lib/actions/profissionais";

export default async function PaginaConvidarProfissional() {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Convidar Profissional</h1>
      <ConvidarProfissionalForm action={convidarProfissional} />
    </div>
  );
}
