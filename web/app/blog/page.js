import Link from "next/link";
import { listarArtigosPublicados } from "@/lib/data/artigos";

export default async function PaginaBlog() {
  const artigos = await listarArtigosPublicados();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Blog</h1>

      {artigos.length === 0 ? (
        <p className="empty-state">Nenhum artigo publicado ainda.</p>
      ) : (
        <div className="space-y-4">
          {artigos.map((a) => (
            <Link key={a.id} href={`/${a.slug}`} className="card p-5 block">
              <p className="text-xs text-muted">
                {new Date(a.publicado_em).toLocaleDateString("pt-BR")}
                {a.autor && ` · ${a.autor}`}
              </p>
              <h2 className="text-lg font-bold text-navy mt-1">{a.titulo}</h2>
              {a.resumo && <p className="text-sm text-muted mt-2">{a.resumo}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
