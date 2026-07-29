"use client";

import { useActionState, useRef } from "react";

const estadoInicial = {};

export default function PacienteForm({ action, paciente, pacotes, consultorios }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const valorSessaoRef = useRef(null);

  function aoTrocarPacote(event) {
    const pacoteId = Number(event.target.value);
    const pacote = pacotes.find((p) => p.id === pacoteId);
    if (pacote && valorSessaoRef.current) {
      valorSessaoRef.current.value = pacote.valor_sugerido;
    }
  }

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome completo
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          defaultValue={paciente?.nome}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="data_nascimento" className="block text-sm font-semibold text-navy">
          Data de nascimento
        </label>
        <input
          id="data_nascimento"
          name="data_nascimento"
          type="date"
          defaultValue={paciente?.data_nascimento}
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
          defaultValue={paciente?.telefone}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={paciente?.email}
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
          defaultValue={paciente?.endereco}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="consultorio" className="block text-sm font-semibold text-navy">
          Consultório
        </label>
        <select
          id="consultorio"
          name="consultorio"
          required
          defaultValue={paciente?.consultorio ?? ""}
          className="field"
        >
          <option value="" disabled>
            Selecione
          </option>
          {consultorios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="pacote" className="block text-sm font-semibold text-navy">
          Pacote de cobrança
        </label>
        <select
          id="pacote"
          name="pacote"
          defaultValue={paciente?.pacote ?? ""}
          onChange={aoTrocarPacote}
          className="field"
        >
          <option value="">Nenhum</option>
          {pacotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="valor_sessao" className="block text-sm font-semibold text-navy">
          Valor da sessão
        </label>
        <input
          ref={valorSessaoRef}
          id="valor_sessao"
          name="valor_sessao"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={paciente?.valor_sessao}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="observacoes" className="block text-sm font-semibold text-navy">
          Observações
        </label>
        <textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          defaultValue={paciente?.observacoes}
          className="field"
        />
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
