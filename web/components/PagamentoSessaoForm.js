"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function PagamentoSessaoForm({ action, valorInicial, contas, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="data_pagamento" className="block text-sm font-semibold text-navy">
          Data do pagamento
        </label>
        <input
          id="data_pagamento"
          name="data_pagamento"
          type="date"
          required
          defaultValue={dataInicial}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="valor" className="block text-sm font-semibold text-navy">
          Valor
        </label>
        <input
          id="valor"
          name="valor"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={valorInicial}
          className="field"
        />
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
        <select
          id="forma_pagamento"
          name="forma_pagamento"
          required
          className="field"
        >
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão">Cartão</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Confirmando..." : "Confirmar pagamento"}
      </button>
    </form>
  );
}
