"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function EscolherPlanoForm({ action }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="space-y-2">
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">{state.sucesso}</p>}
      <button type="submit" disabled={pending} className="btn-outline w-full disabled:opacity-50">
        {pending ? "Aguarde..." : "Escolher"}
      </button>
    </form>
  );
}
