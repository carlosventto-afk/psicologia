import Link from "next/link";
import ListaArtigosAdmin from "@/components/ListaArtigosAdmin";
import { listarArtigosAdmin } from "@/lib/data/artigos";

export default async function PaginaArtigosAdmin() {
  const artigos = await listarArtigosAdmin();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Artigos</h1>
        <Link href="/admin/artigos/novo" className="btn-primary">
          Novo artigo
        </Link>
      </div>

      {artigos.length === 0 ? (
        <p className="empty-state">Nenhum artigo cadastrado ainda.</p>
      ) : (
        <ListaArtigosAdmin artigos={artigos} />
      )}
    </div>
  );
}
