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

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Envio automático por e-mail</legend>
        <div>
          <label htmlFor="carne_leao_frequencia" className="block text-sm font-semibold text-navy">
            Frequência
          </label>
          <select
            id="carne_leao_frequencia"
            name="carne_leao_frequencia"
            defaultValue={usuario?.carne_leao_frequencia ?? ""}
            className="field"
          >
            <option value="">Desativado</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
          </select>
        </div>
        <div>
          <label htmlFor="carne_leao_email" className="block text-sm font-semibold text-navy">
            E-mail de destino
          </label>
          <input
            id="carne_leao_email"
            name="carne_leao_email"
            type="email"
            defaultValue={usuario?.carne_leao_email ?? ""}
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Deixe em branco para usar seu e-mail de login. Pode ser o e-mail do seu contador.
          </p>
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Dados salvos.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
