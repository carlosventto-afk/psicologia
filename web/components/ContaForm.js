"use client";

import { useActionState } from "react";
import { criarConta } from "@/lib/actions/contas";

const estadoInicial = {};

export default function ContaForm() {
  const [state, formAction, pending] = useActionState(criarConta, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="codigo" className="block text-sm font-semibold text-navy">
          Código
        </label>
        <input
          id="codigo"
          name="codigo"
          type="text"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome da conta
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          className="field"
        />
      </div>

      <div>
        <label htmlFor="banco" className="block text-sm font-semibold text-navy">
          Banco
        </label>
        <input
          id="banco"
          name="banco"
          type="text"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="agencia" className="block text-sm font-semibold text-navy">
          Agência
        </label>
        <input
          id="agencia"
          name="agencia"
          type="text"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="numero" className="block text-sm font-semibold text-navy">
          Número da conta
        </label>
        <input
          id="numero"
          name="numero"
          type="text"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="tipo" className="block text-sm font-semibold text-navy">
          Tipo
        </label>
        <select id="tipo" name="tipo" required className="field">
          <option value="Conta Corrente">Conta Corrente</option>
          <option value="Conta Poupança">Conta Poupança</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
