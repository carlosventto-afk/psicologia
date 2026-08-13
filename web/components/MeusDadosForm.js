"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function MeusDadosForm({ action, usuario }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome completo
        </label>
        <input id="nome" name="nome" type="text" required defaultValue={usuario?.nome} className="field" />
      </div>

      <div>
        <label htmlFor="cpf" className="block text-sm font-semibold text-navy">
          CPF
        </label>
        <input id="cpf" name="cpf" type="text" defaultValue={usuario?.cpf ?? ""} className="field" />
        <p className="text-xs text-muted mt-1">
          Obrigatório para gerar o TXT do Carnê-Leão — precisa ser o mesmo CPF de login no Carnê-Leão Web.
        </p>
      </div>

      <div>
        <label htmlFor="crp" className="block text-sm font-semibold text-navy">
          Registro profissional (CRP)
        </label>
        <input id="crp" name="crp" type="text" defaultValue={usuario?.crp ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="contato" className="block text-sm font-semibold text-navy">
          Celular
        </label>
        <input id="contato" name="contato" type="text" defaultValue={usuario?.contato ?? ""} className="field" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Dados salvos.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
