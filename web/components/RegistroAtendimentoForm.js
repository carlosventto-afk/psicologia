"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function RegistroAtendimentoForm({ action }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

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
