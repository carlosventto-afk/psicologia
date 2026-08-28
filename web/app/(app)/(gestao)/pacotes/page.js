import Link from "next/link";
import { listarPacotes } from "@/lib/data/pacotes";

export default async function PaginaPacotes() {
  const pacotes = await listarPacotes();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Pacotes de Cobrança</h1>
        <Link href="/pacotes/novo" className="btn-primary">
          Novo Pacote
        </Link>
      </div>

      {pacotes.length === 0 ? (
        <p className="empty-state">Nenhum pacote cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {pacotes.map((p) => (
            <div
              key={p.id}
              className="card flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{p.nome}</p>
                <p className="text-sm text-muted">
                  {p.tipo_atendimento_nome} · {p.tipo_cobranca_nome} · {p.forma_cobranca} · R$ {p.valor_sugerido}
                </p>
              </div>
              <Link href={`/pacotes/${p.id}/editar`} className="text-sm link">
                Editar
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
