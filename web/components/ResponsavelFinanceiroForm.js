"use client";

import { useActionState } from "react";

const estadoInicial = {};

// valores: dados atuais ao editar ({ nome, cpf_cnpj, telefone, email, paciente_vinculado }).
export default function ResponsavelFinanceiroForm({ action, pacientes = [], valores = {}, rotuloSalvar = "Salvar" }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required defaultValue={valores.nome ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="cpf_cnpj" className="block text-sm font-semibold text-navy">
          CPF/CNPJ (opcional)
        </label>
        <input id="cpf_cnpj" name="cpf_cnpj" type="text" defaultValue={valores.cpf_cnpj ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="telefone" className="block text-sm font-semibold text-navy">
          Telefone (opcional)
        </label>
        <input id="telefone" name="telefone" type="text" defaultValue={valores.telefone ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy">
          E-mail (opcional)
        </label>
        <input id="email" name="email" type="email" defaultValue={valores.email ?? ""} className="field" />
      </div>

      {pacientes.length > 0 && (
        <div>
          <label htmlFor="paciente_vinculado" className="block text-sm font-semibold text-navy">
            Este responsável também é um paciente cadastrado? (opcional)
          </label>
          <select id="paciente_vinculado" name="paciente_vinculado" defaultValue={valores.paciente_vinculado ?? ""} className="field">
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
        {pending ? "Salvando..." : rotuloSalvar}
      </button>
    </form>
  );
}
