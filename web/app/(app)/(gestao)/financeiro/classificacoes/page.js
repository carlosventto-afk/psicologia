import Link from "next/link";
import { listarClassificacoes } from "@/lib/data/classificacoes";

export default async function PaginaClassificacoes() {
  const classificacoes = await listarClassificacoes();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Classificações Financeiras</h1>
        <Link href="/financeiro/classificacoes/novo" className="btn-primary">
          Nova Classificação
        </Link>
      </div>

      {classificacoes.length === 0 ? (
        <p className="empty-state">Nenhuma classificação cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {classificacoes.map((c) => (
            <div key={c.id} className="card px-4 py-3 text-sm">
              <p className="font-semibold text-navy">{c.nome}</p>
              <p className="text-muted">{c.tipo}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
