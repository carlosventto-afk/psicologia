"use client";

import { useActionState } from "react";
import { cancelarNotaFiscal } from "@/lib/actions/notas-fiscais";

const estadoInicial = {};

export default function CancelarNotaFiscalBotao({ notaId }) {
  const acao = cancelarNotaFiscal.bind(null, notaId, "Cancelamento solicitado pelo prestador");
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  function confirmarAntes(event) {
    if (!window.confirm("Cancelar esta nota fiscal? A SEFIN pode rejeitar se o prazo municipal já tiver passado.")) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes}>
      <button type="submit" disabled={pending} className="link text-red-600 disabled:opacity-50">
        {pending ? "Cancelando..." : "Cancelar nota"}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{state.error}</p>}
    </form>
  );
}
