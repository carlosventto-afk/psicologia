"use client";

import { useActionState } from "react";
import { excluirPaciente, desativarPaciente } from "@/lib/actions/pacientes";

const estadoInicial = {};

export default function ExcluirPacienteBotao({ pacienteId }) {
  const acaoComId = excluirPaciente.bind(null, pacienteId);
  const [state, formAction, pending] = useActionState(acaoComId, estadoInicial);
  const acaoDesativar = desativarPaciente.bind(null, pacienteId);

  function confirmarAntes(event) {
    if (!window.confirm("Tem certeza? Essa ação não pode ser desfeita.")) {
      event.preventDefault();
    }
  }

  if (state?.bloqueado) {
    return (
      <div className="card border border-yellow-200 bg-yellow-50 p-4 text-sm space-y-2">
        <p className="font-semibold text-navy">Não é possível excluir este paciente:</p>
        <ul className="list-disc list-inside text-muted">
          {state.vinculos.map((v, indice) => (
            <li key={indice}>
              {v.quantidade ? `${v.quantidade} ${v.tipo}` : `${v.tipo}: ${v.nomes.join(", ")}`}
            </li>
          ))}
        </ul>
        <form action={acaoDesativar}>
          <button type="submit" className="link text-sm">
            Desativar paciente
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes}>
      <button type="submit" disabled={pending} className="link text-red-600 disabled:opacity-50">
        {pending ? "Excluindo..." : "Excluir"}
      </button>
    </form>
  );
}
