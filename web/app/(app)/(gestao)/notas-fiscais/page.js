import { listarPagamentosElegiveisParaNotaFiscal, listarNotasFiscaisEmitidas } from "@/lib/data/notas-fiscais";
import EmitirNotaFiscalBotao from "@/components/EmitirNotaFiscalBotao";

export default async function PaginaNotasFiscais() {
  const [elegiveis, emitidas] = await Promise.all([
    listarPagamentosElegiveisParaNotaFiscal(),
    listarNotasFiscaisEmitidas(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Notas Fiscais</h1>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Pagamentos elegíveis</h2>
        {elegiveis.length === 0 ? (
          <p className="empty-state">
            Nenhum pagamento disponível para emissão. Só aparecem aqui pagamentos de pacientes com &quot;Documento&quot;
            marcado como Nota Fiscal no cadastro.
          </p>
        ) : (
          <div className="space-y-3">
            {elegiveis.map((p) => (
              <div key={p.pagamentoId} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">{p.pacienteNome}</p>
                  <p className="text-muted">
                    {p.dataSessao} — R$ {Number(p.valor).toFixed(2)}
                  </p>
                </div>
                <EmitirNotaFiscalBotao pagamentoId={p.pagamentoId} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Notas emitidas</h2>
        {emitidas.length === 0 ? (
          <p className="empty-state">Nenhuma nota emitida ainda.</p>
        ) : (
          <div className="space-y-3">
            {emitidas.map((n) => (
              <div key={n.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">
                    {n.pacienteNome} — Nº {n.numero}/{n.serie}
                  </p>
                  <p className="text-muted">
                    {n.status === "autorizada" && `Autorizada (${n.ambiente})`}
                    {n.status === "rejeitada" && `Rejeitada: ${n.erros?.[0]?.titulo ?? "erro"}`}
                    {n.status === "cancelada" && "Cancelada"}
                    {n.status === "pendente" && "Pendente"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
