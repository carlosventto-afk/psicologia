"use client";

import { useState } from "react";

export default function CarneLeaoForm({ porPagador, mes, ano }) {
  const [gruposPorPagador, setGruposPorPagador] = useState(() =>
    Object.fromEntries(porPagador.map((p) => [p.cpfPagador, p.pagamentos.map((item) => [item.pagamentoId])]))
  );
  const [selecionados, setSelecionados] = useState({});

  function alternarSelecao(cpfPagador, id) {
    setSelecionados((atual) => {
      const lista = atual[cpfPagador] ?? [];
      const nova = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      return { ...atual, [cpfPagador]: nova };
    });
  }

  function combinar(cpfPagador) {
    const ids = selecionados[cpfPagador] ?? [];
    if (ids.length < 2) return;
    setGruposPorPagador((atual) => {
      const grupos = atual[cpfPagador];
      const restante = grupos.filter((grupo) => !grupo.some((id) => ids.includes(id)));
      return { ...atual, [cpfPagador]: [...restante, ids] };
    });
    setSelecionados((atual) => ({ ...atual, [cpfPagador]: [] }));
  }

  const todosGrupos = Object.values(gruposPorPagador).flat();

  return (
    <form method="POST" action="/carne-leao/gerar" className="space-y-4">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="grupos" value={JSON.stringify(todosGrupos)} />

      {porPagador.map((pagador) => {
        const grupos = gruposPorPagador[pagador.cpfPagador];
        const porId = Object.fromEntries(pagador.pagamentos.map((item) => [item.pagamentoId, item]));
        const selecionadosDoPagador = selecionados[pagador.cpfPagador] ?? [];

        return (
          <div key={pagador.cpfPagador} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-navy">{pagador.pagadorNome}</p>
              <button
                type="button"
                onClick={() => combinar(pagador.cpfPagador)}
                disabled={selecionadosDoPagador.length < 2}
                className="btn-outline py-1 px-2 text-xs disabled:opacity-50"
              >
                Combinar em um recibo
              </button>
            </div>

            <div className="space-y-2">
              {grupos.map((grupoIds, index) => {
                const itens = grupoIds.map((id) => porId[id]).filter(Boolean);
                if (itens.length === 0) return null;
                const combinado = itens.length > 1;
                return (
                  <div
                    key={index}
                    className="text-sm space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0"
                  >
                    {combinado && (
                      <p className="text-muted text-xs">{itens.length} atendimentos combinados em um recibo</p>
                    )}
                    {itens.map((item) => (
                      <label key={item.pagamentoId} className="flex items-center gap-2 text-navy">
                        <input
                          type="checkbox"
                          checked={selecionadosDoPagador.includes(item.pagamentoId)}
                          disabled={combinado}
                          onChange={() => alternarSelecao(pagador.cpfPagador, item.pagamentoId)}
                        />
                        {item.dataPagamento} — R$ {Number(item.valor).toFixed(2)}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button type="submit" className="btn-primary">
        Gerar TXT
      </button>
    </form>
  );
}
