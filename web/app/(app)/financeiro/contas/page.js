import Link from "next/link";
import { listarContas } from "@/lib/data/contas";

export default async function PaginaContas() {
  const contas = await listarContas();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Contas Financeiras</h1>
        <Link
          href="/financeiro/contas/novo"
          className="btn-primary"
        >
          Nova Conta
        </Link>
      </div>

      {contas.length === 0 ? (
        <p className="empty-state">Nenhuma conta cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {contas.map((c) => (
            <div key={c.id} className="card px-4 py-3 text-sm">
              <p className="font-semibold text-navy">{c.nome}</p>
              <p className="text-muted">
                {c.banco} · Ag. {c.agencia} · Conta {c.numero} · {c.tipo}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
