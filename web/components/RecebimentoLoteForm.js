"use client";

import { useActionState, useMemo, useState } from "react";

const estadoInicial = {};

export default function RecebimentoLoteForm({ action, sessoes, contas, responsaveis, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [selecionadas, setSelecionadas] = useState([]);

  const total = useMemo(
    () => sessoes.filter((s) => selecionadas.includes(s.id)).reduce((soma, s) => soma + s.saldo_devedor, 0),
    [sessoes, selecionadas]
  );

  function alternarSessao(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((s) => s !== id) : [...atual, id]));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="card divide-y divide-border">
        {sessoes.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nenhuma sessão em aberto — só é possível registrar crédito antecipado.</p>
        ) : (
          sessoes.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="sessao_id"
                  value={s.id}
                  checked={selecionadas.includes(s.id)}
                  onChange={() => alternarSessao(s.id)}
                  className="h-4 w-4"
                />
                {s.data} {s.horario?.slice(0, 5)}
              </span>
              <span className="font-semibold text-navy">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.saldo_devedor)}
              </span>
            </label>
          ))
        )}
      </div>

      {selecionadas.length > 0 ? (
        <p className="text-sm font-semibold text-navy">
          Total selecionado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
        </p>
      ) : (
        <div>
          <label htmlFor="valor_credito" className="block text-sm font-semibold text-navy">
            Nenhuma sessão selecionada — valor a receber como crédito antecipado
          </label>
          <input id="valor_credito" name="valor_credito" type="number" step="0.01" min="0.01" className="field" />
        </div>
      )}

      <div>
        <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
          Responsável financeiro
        </label>
        <select id="responsavel_financeiro" name="responsavel_financeiro" required defaultValue={responsaveis.length === 1 ? responsaveis[0].id : ""} className="field">
          <option value="" disabled>
            Selecione
          </option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
              {r.eh_proprio ? " (o próprio paciente)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="data_recebimento" className="block text-sm font-semibold text-navy">
          Data do recebimento
        </label>
        <input id="data_recebimento" name="data_recebimento" type="date" required defaultValue={dataInicial} className="field" />
      </div>

      <div>
        <label htmlFor="conta" className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id="conta" name="conta" required className="field">
          <option value="" disabled>
            Selecione
          </option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="forma_pagamento" className="block text-sm font-semibold text-navy">
          Forma de pagamento
        </label>
        <select id="forma_pagamento" name="forma_pagamento" required className="field">
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão">Cartão</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Confirmando..." : "Confirmar recebimento"}
      </button>
    </form>
  );
}
