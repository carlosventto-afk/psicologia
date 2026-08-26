import { listarRecorrenciasDespesa } from "@/lib/data/recorrencias-despesa";
import { cancelarRecorrenciaDespesa } from "@/lib/actions/recorrencias-despesa";

export default async function PaginaRecorrenciasDespesa() {
  const recorrencias = await listarRecorrenciasDespesa();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Despesas Recorrentes</h1>

      {recorrencias.length === 0 ? (
        <p className="empty-state">Nenhuma despesa recorrente ativa.</p>
      ) : (
        <div className="space-y-3">
          {recorrencias.map((r) => {
            const acao = cancelarRecorrenciaDespesa.bind(null, r.id);
            return (
              <div key={r.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">{r.descricao}</p>
                  <p className="text-muted">
                    R$ {r.valor} · {r.frequencia} · gerado até {r.gerado_ate}
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
