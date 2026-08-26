"use client";

import { useActionState, useState } from "react";

const estadoInicial = {};

export default function LancamentoForm({
  action,
  contas,
  classificacoes,
  permitirRecorrencia = false,
  valoresIniciais = {},
}) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [tipo, setTipo] = useState(valoresIniciais.tipo ?? "Receita");

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
        <select
          id="tipo"
          name="tipo"
          required
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="field"
        >
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

      <div>
        <label htmlFor="classificacao" className="block text-sm font-semibold text-navy">
          Classificação
        </label>
        <select
          id="classificacao"
          name="classificacao"
          defaultValue={valoresIniciais.classificacao ?? ""}
          className="field"
        >
          <option value="">Nenhuma</option>
          {classificacoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.tipo})
            </option>
          ))}
        </select>
      </div>

      {permitirRecorrencia && tipo === "Despesa" && (
        <div>
          <label htmlFor="frequencia" className="block text-sm font-semibold text-navy">
            Repetir
          </label>
          <select id="frequencia" name="frequencia" defaultValue="Nenhuma" className="field">
            <option value="Nenhuma">Não repetir</option>
            <option value="Semanal">Semanal</option>
            <option value="Quinzenal">Quinzenal</option>
            <option value="Mensal">Mensal</option>
          </select>
        </div>
      )}

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
