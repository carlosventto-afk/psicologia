import Link from "next/link";
import { listarRecorrencias } from "@/lib/data/recorrencias";
import { cancelarRecorrencia } from "@/lib/actions/recorrencias";

export default async function PaginaRecorrencias() {
  const recorrencias = await listarRecorrencias();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Recorrências</h1>

      {recorrencias.length === 0 ? (
        <p className="empty-state">Nenhuma recorrência ativa.</p>
      ) : (
        <div className="space-y-3">
          {recorrencias.map((r) => {
            const acao = cancelarRecorrencia.bind(null, r.id);
            return (
              <div
                key={r.id}
                className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link href={`/pacientes/${r.paciente_id}`} className="font-semibold text-navy">
                    {r.paciente_nome}
                  </Link>
                  <p className="text-muted">
                    {r.frequencia} · {r.horario} · gerado até {r.gerado_ate}
                  </p>
                </div>
                <form action={acao}>
                  <button type="submit" className="link">
                    Cancelar recorrência
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
