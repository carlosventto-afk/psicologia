"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function ConvidarProfissionalForm({ action }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form
      action={formAction}
      key={state?.mensagem ?? "form"}
      className="max-w-md space-y-4 card p-6"
    >
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className="field" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy">
          E-mail
        </label>
        <input id="email" name="email" type="email" required className="field" />
      </div>

      <div>
        <label htmlFor="contato" className="block text-sm font-semibold text-navy">
          Telefone
        </label>
        <input id="contato" name="contato" type="text" required className="field" />
      </div>

      <div>
        <label htmlFor="crp" className="block text-sm font-semibold text-navy">
          CRP (opcional)
        </label>
        <input id="crp" name="crp" type="text" className="field" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.mensagem && <p className="text-sm text-green-700">{state.mensagem}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Enviando..." : "Enviar convite"}
      </button>
    </form>
  );
}
