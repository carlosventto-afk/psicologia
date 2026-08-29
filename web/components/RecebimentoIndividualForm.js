"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function RecebimentoIndividualForm({ action, valor, contas, responsaveis, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <p className="text-sm font-semibold text-navy">Valor da sessão</p>
        <p className="text-lg font-bold text-navy">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)}</p>
      </div>

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
