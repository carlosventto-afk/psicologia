import Link from "next/link";
import { listarPacotes } from "@/lib/data/pacotes";

export default async function PaginaPacotes() {
  const pacotes = await listarPacotes();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Pacotes de Cobrança</h1>
        <Link href="/pacotes/novo" className="btn-primary">
          Novo Pacote
        </Link>
      </div>

      {pacotes.length === 0 ? (
        <p className="empty-state">Nenhum pacote cadastrado.</p>
      ) : (
        <div className="card divide-y">
          {pacotes.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-navy">{p.nome}</p>
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
