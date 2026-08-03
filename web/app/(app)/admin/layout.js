import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutAdmin({ children }) {
  const usuario = await buscarUsuarioAtual();

  if (usuario.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-4 text-sm font-semibold text-navy">
        <Link href="/admin/profissionais">Profissionais</Link>
        <Link href="/admin/artigos">Blog</Link>
      </nav>
      {children}
    </div>
  );
}
