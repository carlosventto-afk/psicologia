"use client";

import { useActionState, useRef } from "react";

const estadoInicial = {};

export default function SessaoForm({ action, pacientes, pacotes, tiposAtendimento, pacienteInicialId }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const tipoSessaoRef = useRef(null);

  const pacotesPorId = Object.fromEntries(pacotes.map((p) => [p.id, p]));

  function aoTrocarPaciente(event) {
    const pacienteId = Number(event.target.value);
    const paciente = pacientes.find((p) => p.id === pacienteId);
    const pacote = paciente?.pacote ? pacotesPorId[paciente.pacote] : null;
    if (pacote && tipoSessaoRef.current) {
      tipoSessaoRef.current.value = pacote.tipo_atendimento_nome;
    }
  }

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="paciente" className="block text-sm font-semibold text-navy">
          Paciente
        </label>
        <select
          id="paciente"
          name="paciente"
          required
          defaultValue={pacienteInicialId ?? ""}
          onChange={aoTrocarPaciente}
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
          defaultValue={50}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="tipo_sessao" className="block text-sm font-semibold text-navy">
          Tipo de Atendimento
        </label>
        <select
          ref={tipoSessaoRef}
          id="tipo_sessao"
          name="tipo_sessao"
          required
          defaultValue=""
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
          Semanal, Quinzenal e Mensal geram os próximos atendimentos automaticamente.
        </p>
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
