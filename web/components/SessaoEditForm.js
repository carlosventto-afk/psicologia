"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function SessaoEditForm({ action, cancelarAction, sessao, pacientes, tiposAtendimento }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <div className="space-y-4">
      <form action={formAction} className="max-w-md space-y-4 card p-6">
        <div>
          <label htmlFor="paciente" className="block text-sm font-semibold text-navy">
            Paciente
          </label>
          <select
            id="paciente"
            name="paciente"
            required
            defaultValue={sessao.paciente_id}
            className="field"
          >
            <option value="" disabled>
              Selecione
            </option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="data" className="block text-sm font-semibold text-navy">
            Data
          </label>
          <input
            id="data"
            name="data"
            type="date"
            required
            defaultValue={sessao.data}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="horario" className="block text-sm font-semibold text-navy">
            Horário
          </label>
          <input
            id="horario"
            name="horario"
            type="time"
            required
            defaultValue={sessao.horario}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="duracao_min" className="block text-sm font-semibold text-navy">
            Duração (minutos)
          </label>
          <input
            id="duracao_min"
            name="duracao_min"
            type="number"
            min="1"
            required
            defaultValue={sessao.duracao_min}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="tipo_sessao" className="block text-sm font-semibold text-navy">
            Tipo de Atendimento
          </label>
          <select
            id="tipo_sessao"
            name="tipo_sessao"
            required
            defaultValue={sessao.tipo_sessao ?? ""}
            className="field"
          >
            <option value="" disabled>
              Selecione
            </option>
            {tiposAtendimento.map((t) => (
              <option key={t.id} value={t.Nome}>
                {t.Nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">
            Alterar o tipo aqui afeta só esta sessão, não a série de recorrência.
          </p>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>

      {sessao.status !== "Cancelada" && (
        <form
          action={cancelarAction}
          className="max-w-md"
          onSubmit={(event) => {
            if (!confirm("Tem certeza que deseja cancelar esta sessão? Essa ação não pode ser desfeita.")) {
              event.preventDefault();
            }
          }}
        >
          <button type="submit" className="btn-danger">
            Cancelar esta sessão
          </button>
        </form>
      )}
    </div>
  );
}
