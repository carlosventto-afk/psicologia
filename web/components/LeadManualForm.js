"use client";

import { useActionState } from "react";
import { criarLeadManual } from "@/lib/actions/crm";

const estadoInicial = {};

export default function LeadManualForm() {
  const [state, formAction, pending] = useActionState(criarLeadManual, estadoInicial);

  return (
    <form action={formAction} className="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="nome" className="block text-xs font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className="field mt-1" />
      </div>
      <div>
        <label htmlFor="telefone" className="block text-xs font-semibold text-navy">
          Telefone
        </label>
        <input id="telefone" name="telefone" type="text" required className="field mt-1" />
      </div>
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-navy">
          E-mail (opcional)
        </label>
        <input id="email" name="email" type="email" className="field mt-1" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Criando..." : "Novo lead"}
      </button>
      {state?.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
      {state?.mensagem && <p className="text-sm text-green-700 w-full">{state.mensagem}</p>}
    </form>
  );
}
