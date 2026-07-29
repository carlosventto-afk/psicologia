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
        <div className="card divide-y">
          {recorrencias.map((r) => {
            const acao = cancelarRecorrencia.bind(null, r.id);
            return (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
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
