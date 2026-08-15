"use client";

import { useActionState } from "react";
import { CAMPOS_ANAMNESE } from "@/lib/anamnese-campos";

const estadoInicial = {};

export default function AnamneseForm({ action, anamnese }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-2xl space-y-4 card p-6">
      {CAMPOS_ANAMNESE.map(({ chave, rotulo }) => (
        <div key={chave}>
          <label htmlFor={chave} className="block text-sm font-semibold text-navy">
            {rotulo}
          </label>
          <textarea
            id={chave}
            name={chave}
            rows={2}
            defaultValue={anamnese?.[chave] ?? ""}
            className="field"
          />
        </div>
      ))}

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Observação desta atualização</legend>
        <label htmlFor="observacao" className="sr-only">
          Observação desta atualização
        </label>
        <textarea
          id="observacao"
          name="observacao"
          rows={2}
          placeholder="Algo que não se encaixa nos campos acima, mesmo que nenhum deles tenha mudado"
          className="field"
        />
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar atualização"}
      </button>
    </form>
  );
}
