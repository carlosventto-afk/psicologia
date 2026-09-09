"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function ResponsavelFinanceiroForm({ action, pacientes = [] }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className="field" />
      </div>

      <div>
        <label htmlFor="cpf_cnpj" className="block text-sm font-semibold text-navy">
          CPF/CNPJ (opcional)
        </label>
        <input id="cpf_cnpj" name="cpf_cnpj" type="text" className="field" />
      </div>

      <div>
        <label htmlFor="telefone" className="block text-sm font-semibold text-navy">
          Telefone (opcional)
        </label>
        <input id="telefone" name="telefone" type="text" className="field" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy">
          E-mail (opcional)
        </label>
        <input id="email" name="email" type="email" className="field" />
      </div>

      {pacientes.length > 0 && (
        <div>
          <label htmlFor="paciente_vinculado" className="block text-sm font-semibold text-navy">
            Este responsável também é um paciente cadastrado? (opcional)
          </label>
          <select id="paciente_vinculado" name="paciente_vinculado" defaultValue="" className="field">
            <option value="">Não, é um responsável avulso</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.apelido ? ` (${p.apelido})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Responsável salvo com sucesso.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
