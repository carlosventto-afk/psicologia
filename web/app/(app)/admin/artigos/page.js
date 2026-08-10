import Link from "next/link";
import { listarArtigosAdmin } from "@/lib/data/artigos";

export default async function PaginaArtigosAdmin() {
  const artigos = await listarArtigosAdmin();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Artigos</h1>
        <Link href="/admin/artigos/novo" className="btn-primary">
          Novo artigo
        </Link>
      </div>

      {artigos.length === 0 ? (
        <p className="empty-state">Nenhum artigo cadastrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {artigos.map((a) => (
            <div key={a.id} className="card flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-navy">{a.titulo}</p>
                <p className="text-sm text-muted">
                  {a.publicado ? "Publicado" : "Rascunho"} · /blog/{a.slug}
                </p>
              </div>
              <Link href={`/admin/artigos/${a.id}/editar`} className="text-sm link">
                Editar
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
