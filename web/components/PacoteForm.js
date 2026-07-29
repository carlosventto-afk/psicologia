"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function PacoteForm({ action, pacote, tiposAtendimento, tiposCobranca }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome do pacote
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          defaultValue={pacote?.nome}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="dimensao_atendimento" className="block text-sm font-semibold text-navy">
          Tipo de Atendimento
        </label>
        <select
          id="dimensao_atendimento"
          name="dimensao_atendimento"
          required
          defaultValue={pacote?.dimensao_atendimento ?? ""}
          className="field"
        >
          <option value="" disabled>
            Selecione
          </option>
          {tiposAtendimento.map((t) => (
            <option key={t.id} value={t.id}>
              {t.Nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="dimensao_cobranca" className="block text-sm font-semibold text-navy">
          Dimensão de cobrança
        </label>
        <select
          id="dimensao_cobranca"
          name="dimensao_cobranca"
          required
          defaultValue={pacote?.dimensao_cobranca ?? ""}
          className="field"
        >
          <option value="" disabled>
            Selecione
          </option>
          {tiposCobranca.map((t) => (
            <option key={t.id} value={t.id}>
              {t.Nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="forma_cobranca" className="block text-sm font-semibold text-navy">
          Forma de cobrança
        </label>
        <select
          id="forma_cobranca"
          name="forma_cobranca"
          required
          defaultValue={pacote?.forma_cobranca ?? ""}
          className="field"
        >
          <option value="" disabled>
            Selecione
          </option>
          <option value="Antecipada">Antecipada</option>
          <option value="Posterior">Posterior</option>
        </select>
      </div>

      <div>
        <label htmlFor="valor_sugerido" className="block text-sm font-semibold text-navy">
          Valor sugerido por sessão
        </label>
        <input
          id="valor_sugerido"
          name="valor_sugerido"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={pacote?.valor_sugerido}
          className="field"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar pacote"}
      </button>
    </form>
  );
}
