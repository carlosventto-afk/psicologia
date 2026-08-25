"use client";

import { useActionState, useState } from "react";
import { gerarLinkCompletarCadastro } from "@/lib/actions/completar-cadastro";

const estadoInicial = {};

export default function GerarLinkCadastroBotao({ pacienteId }) {
  const acaoComId = gerarLinkCompletarCadastro.bind(null, pacienteId);
  const [state, formAction, pending] = useActionState(acaoComId, estadoInicial);
  const [copiado, setCopiado] = useState(false);

  function copiarLink() {
    navigator.clipboard.writeText(state.link);
    setCopiado(true);
  }

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <button type="submit" disabled={pending} className="link disabled:opacity-50">
          {pending ? "Gerando..." : "Gerar link de atualização"}
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state?.link && (
        <div className="card p-4 text-sm space-y-2">
          <p className="text-muted">Envie este link ao paciente (válido por 7 dias, uso único):</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.link} className="field flex-1" />
            <button type="button" onClick={copiarLink} className="link text-sm">
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
