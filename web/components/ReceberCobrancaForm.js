"use client";

import { useActionState } from "react";
import { receberCobranca } from "@/lib/actions/cobrancas";
import { hojeISO } from "@/lib/periodo-agenda";

const estadoInicial = {};

export default function ReceberCobrancaForm({ cobrancaId, contas, hoje }) {
  const acao = receberCobranca.bind(null, cobrancaId);
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  const semContas = contas.length === 0;

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor={`data_recebimento-${cobrancaId}`} className="block text-sm font-semibold text-navy">
          Data do recebimento
        </label>
        <input
          id={`data_recebimento-${cobrancaId}`}
          name="data_recebimento"
          type="date"
          required
          defaultValue={hoje ?? hojeISO()}
          className="field"
        />
      </div>

      <div>
        <label htmlFor={`conta-${cobrancaId}`} className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id={`conta-${cobrancaId}`} name="conta" required defaultValue="" className="field">
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
        <label htmlFor={`forma_pagamento-${cobrancaId}`} className="block text-sm font-semibold text-navy">
          Forma de pagamento
        </label>
        <select id={`forma_pagamento-${cobrancaId}`} name="forma_pagamento" required className="field">
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão">Cartão</option>
        </select>
      </div>

      {semContas && (
        <p className="text-sm text-red-600">
          Cadastre uma conta financeira em Financeiro &gt; Contas para receber.
        </p>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending || semContas} className="btn-primary disabled:opacity-50">
        {pending ? "Confirmando..." : "Confirmar recebimento"}
      </button>
    </form>
  );
}
