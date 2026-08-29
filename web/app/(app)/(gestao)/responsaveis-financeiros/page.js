import Link from "next/link";
import { listarResponsaveisFinanceiros } from "@/lib/data/responsaveis-financeiros";

export default async function PaginaResponsaveisFinanceiros() {
  const responsaveis = await listarResponsaveisFinanceiros();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Responsáveis Financeiros</h1>
        <Link href="/responsaveis-financeiros/novo" className="btn-primary">
          Novo Responsável
        </Link>
      </div>

      {responsaveis.length === 0 ? (
        <p className="empty-state">Nenhum responsável financeiro cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {responsaveis.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-navy">{r.nome}</p>
                <p className="text-muted">{r.telefone || r.email || "—"}</p>
              </div>
              <span className={`font-semibold ${r.qtd_pacientes > 1 ? "text-primary" : "text-muted"}`}>
                {r.qtd_pacientes} paciente(s) vinculado(s)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
