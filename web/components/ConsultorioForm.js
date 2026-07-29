"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function ConsultorioForm({ action, consultorio }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome do consultório
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          defaultValue={consultorio?.nome}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="endereco" className="block text-sm font-semibold text-navy">
          Endereço (opcional)
        </label>
        <input
          id="endereco"
          name="endereco"
          type="text"
          defaultValue={consultorio?.endereco}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="telefone" className="block text-sm font-semibold text-navy">
          Telefone
        </label>
        <input
          id="telefone"
          name="telefone"
          type="text"
          defaultValue={consultorio?.telefone}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="email_atendimento" className="block text-sm font-semibold text-navy">
          E-mail de atendimento
        </label>
        <input
          id="email_atendimento"
          name="email_atendimento"
          type="email"
          defaultValue={consultorio?.email_atendimento}
          className="field"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar consultório"}
      </button>
    </form>
  );
}
