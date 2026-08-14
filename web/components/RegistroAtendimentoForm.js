"use client";

import { useActionState, useState } from "react";

const estadoInicial = {};

export default function RegistroAtendimentoForm({ action, contas, valorInicial, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [pagou, setPagou] = useState(false);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="anotacoes" className="block text-sm font-semibold text-navy">
          Anotações
        </label>
        <textarea
          id="anotacoes"
          name="anotacoes"
          rows={4}
          className="field"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="pagou"
          name="pagou"
          type="checkbox"
          checked={pagou}
          onChange={(e) => setPagou(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="pagou" className="text-sm font-semibold text-navy">
          Paciente pagou nesta sessão?
        </label>
      </div>

      {pagou && (
        <div className="space-y-4 border-l-2 border-slate-200 pl-4">
          <div>
            <label htmlFor="data_pagamento" className="block text-sm font-semibold text-navy">
              Data do pagamento
            </label>
            <input
              id="data_pagamento"
              name="data_pagamento"
              type="date"
              required={pagou}
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
              required={pagou}
              defaultValue={valorInicial}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="conta" className="block text-sm font-semibold text-navy">
              Conta
            </label>
            <select id="conta" name="conta" required={pagou} className="field">
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
            <select id="forma_pagamento" name="forma_pagamento" required={pagou} className="field">
              <option value="Dinheiro">Dinheiro</option>
              <option value="Pix">Pix</option>
              <option value="Cartão">Cartão</option>
            </select>
          </div>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Marcar como realizado"}
      </button>
    </form>
  );
}
