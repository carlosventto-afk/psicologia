"use client";

import { useActionState } from "react";
import { receberCobranca } from "@/lib/actions/cobrancas";
import { hojeISO } from "@/lib/periodo-agenda";

const estadoInicial = {};

export default function ReceberCobrancaForm({ cobrancaId, contas, hoje }) {
  const acao = receberCobranca.bind(null, cobrancaId);
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="data_recebimento" className="block text-sm font-semibold text-navy">
          Data do recebimento
        </label>
        <input
          id="data_recebimento"
          name="data_recebimento"
          type="date"
          required
          defaultValue={hoje ?? hojeISO()}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="conta" className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id="conta" name="conta" required defaultValue="" className="field">
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
