import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutAdmin({ children }) {
  const usuario = await buscarUsuarioAtual();

  if (usuario.role !== "admin" && !usuario.criador_conteudo) {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-4 text-sm font-semibold text-navy">
        {usuario.role === "admin" && <Link href="/admin/profissionais">Profissionais</Link>}
        <Link href="/admin/artigos">Blog</Link>
      </nav>
      {children}
    </div>
  );
}
