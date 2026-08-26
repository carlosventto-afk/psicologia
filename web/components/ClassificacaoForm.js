"use client";

import { useActionState } from "react";
import { criarClassificacao } from "@/lib/actions/classificacoes";

const estadoInicial = {};

export default function ClassificacaoForm() {
  const [state, formAction, pending] = useActionState(criarClassificacao, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className="field" />
      </div>

      <div>
        <label htmlFor="tipo" className="block text-sm font-semibold text-navy">
          Tipo
        </label>
        <select id="tipo" name="tipo" required defaultValue="Ambos" className="field">
          <option value="Receita">Receita</option>
          <option value="Despesa">Despesa</option>
          <option value="Ambos">Ambos</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
