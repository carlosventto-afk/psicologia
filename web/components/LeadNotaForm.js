"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function LeadNotaForm({ action }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="card p-4 space-y-2">
      <textarea
        name="texto"
        rows={3}
        placeholder="Registrar contato, dúvida, próximo passo..."
        className="field"
        required
      />
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Adicionar nota"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
