import Link from "next/link";
import { listarProfissionais } from "@/lib/data/profissionais";
import { aprovarProfissional } from "@/lib/actions/profissionais";

export default async function PaginaProfissionais() {
  const profissionais = await listarProfissionais();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Profissionais</h1>
        <Link href="/admin/profissionais/novo" className="btn-primary">
          Convidar profissional
        </Link>
      </div>

      {profissionais.length === 0 ? (
        <p className="empty-state">Nenhum profissional cadastrado ainda.</p>
      ) : (
        <div className="card divide-y">
          {profissionais.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-navy">{p.nome}</p>
                <p className="text-sm text-muted">
                  {p.email} · {p.contato}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {p.role === "admin" ? "Admin" : "Psicólogo"}
                </span>
                {p.aprovado ? (
                  <span className="text-sm text-green-700">Aprovado</span>
                ) : (
                  <form action={aprovarProfissional.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      Aprovar (pendente)
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
