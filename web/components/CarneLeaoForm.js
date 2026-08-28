"use client";

import { useState } from "react";
import { desmarcarGeradoCarneLeao } from "@/lib/actions/carne-leao";
import { formatarMoeda } from "@/lib/formatar-moeda";

export default function CarneLeaoForm({ porPagador, mes, ano }) {
  const [gruposPorPagador, setGruposPorPagador] = useState(() =>
    Object.fromEntries(porPagador.map((p) => [p.chave, p.pagamentos.map((item) => [item.pagamentoId])]))
  );
  const [selecionados, setSelecionados] = useState({});

  function alternarSelecao(chave, id) {
    setSelecionados((atual) => {
      const lista = atual[chave] ?? [];
      const nova = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      return { ...atual, [chave]: nova };
    });
  }

  function combinar(chave) {
    const ids = selecionados[chave] ?? [];
    if (ids.length < 2) return;
    setGruposPorPagador((atual) => {
      const grupos = atual[chave];
      const restante = grupos.filter((grupo) => !grupo.some((id) => ids.includes(id)));
      return { ...atual, [chave]: [...restante, ids] };
    });
    setSelecionados((atual) => ({ ...atual, [chave]: [] }));
  }

  const todosGrupos = Object.values(gruposPorPagador).flat();
  const porIdGeral = Object.fromEntries(
    porPagador.flatMap((pagador) => pagador.pagamentos).map((item) => [item.pagamentoId, item])
  );

  function confirmarEnvio(evento) {
    const idsEnviados = todosGrupos.flat();
    const jaGerados = idsEnviados.filter((id) => porIdGeral[id]?.jaGerado).length;
    if (jaGerados > 0 && !window.confirm(`${jaGerados} atendimento(s) já geraram TXT antes. Gerar mesmo assim?`)) {
      evento.preventDefault();
    }
  }

  async function desmarcar(pagamentoId) {
    await desmarcarGeradoCarneLeao(pagamentoId);
  }

  return (
    <form method="POST" action="/carne-leao/gerar" className="space-y-4" onSubmit={confirmarEnvio}>
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="grupos" value={JSON.stringify(todosGrupos)} />

      {porPagador.map((pagador) => {
        const grupos = gruposPorPagador[pagador.chave];
        const porId = Object.fromEntries(pagador.pagamentos.map((item) => [item.pagamentoId, item]));
        const selecionadosDoPagador = selecionados[pagador.chave] ?? [];

        return (
          <div key={pagador.chave} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-navy">
                {pagador.pagadorNome}
                {pagador.pacienteNome !== pagador.pagadorNome && (
                  <span className="text-muted font-normal"> — paciente: {pagador.pacienteNome}</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => combinar(pagador.chave)}
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
                      <div key={item.pagamentoId} className="flex items-center gap-2 text-navy">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selecionadosDoPagador.includes(item.pagamentoId)}
                            disabled={combinado}
                            onChange={() => alternarSelecao(pagador.chave, item.pagamentoId)}
                          />
                          {item.dataPagamento} — {formatarMoeda(item.valor)}
                        </label>
                        {item.jaGerado && (
                          <span className="flex items-center gap-1 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5">
                            já gerado em {new Date(item.jaGerado).toLocaleDateString("pt-BR")}
                            <button
                              type="button"
                              onClick={() => desmarcar(item.pagamentoId)}
                              className="underline font-semibold"
                            >
                              Desmarcar
                            </button>
                          </span>
                        )}
                      </div>
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
