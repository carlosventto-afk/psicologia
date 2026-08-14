"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function LancamentoForm({ action, contas, valoresIniciais = {} }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="data" className="block text-sm font-semibold text-navy">
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          required
          defaultValue={valoresIniciais.data}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="descricao" className="block text-sm font-semibold text-navy">
          Descrição
        </label>
        <input
          id="descricao"
          name="descricao"
          type="text"
          required
          defaultValue={valoresIniciais.descricao}
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
          defaultValue={valoresIniciais.valor}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="tipo" className="block text-sm font-semibold text-navy">
          Tipo
        </label>
        <select id="tipo" name="tipo" required defaultValue={valoresIniciais.tipo ?? "Receita"} className="field">
          <option value="Receita">Receita</option>
          <option value="Despesa">Despesa</option>
        </select>
      </div>

      <div>
        <label htmlFor="conta" className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id="conta" name="conta" defaultValue={valoresIniciais.conta ?? ""} className="field">
          <option value="">Nenhuma</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
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
