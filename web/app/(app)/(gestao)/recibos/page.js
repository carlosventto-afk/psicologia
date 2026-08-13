import { listarSessoesElegiveisParaRecibo, listarRecibosEmitidos } from "@/lib/data/recibos";
import { gerarRecibo } from "@/lib/actions/recibos";

export default async function PaginaRecibos() {
  const [elegiveis, emitidos] = await Promise.all([listarSessoesElegiveisParaRecibo(), listarRecibosEmitidos()]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Recibos</h1>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Sessões elegíveis</h2>
        {elegiveis.length === 0 ? (
          <p className="empty-state">
            Nenhuma sessão disponível para recibo. Só aparecem aqui sessões de pacientes marcados como "Precisa de
            recibo" no cadastro.
          </p>
        ) : (
          <div className="space-y-3">
            {elegiveis.map((s) => {
              const acao = gerarRecibo.bind(null, s.id);
              return (
                <div key={s.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-navy">
                      {s.paciente_nome}
                      {s.paciente_dependente && s.responsavel_nome && (
                        <span className="text-muted font-normal"> (dependente de {s.responsavel_nome})</span>
                      )}
                    </p>
                    <p className="text-muted">
                      {s.data} {s.horario}
                    </p>
                  </div>
                  <form action={acao}>
                    <button type="submit" className="link">
                      Gerar recibo
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Recibos emitidos</h2>
        {emitidos.length === 0 ? (
          <p className="empty-state">Nenhum recibo emitido ainda.</p>
        ) : (
          <div className="space-y-3">
            {emitidos.map((r) => (
              <div key={r.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold text-navy">
                  {r.paciente_nome}
                  {r.paciente_dependente && r.responsavel_nome && (
                    <span className="text-muted font-normal"> (dependente de {r.responsavel_nome})</span>
                  )}
                </span>
                <span className="text-muted">{r.data_emissao}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
