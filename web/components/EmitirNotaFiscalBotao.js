"use client";

import { useActionState } from "react";
import { emitirNotaFiscal } from "@/lib/actions/notas-fiscais";

const estadoInicial = {};

export default function EmitirNotaFiscalBotao({ pagamentoId }) {
  const acao = emitirNotaFiscal.bind(null, pagamentoId);
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  return (
    <form action={formAction} className="text-right">
      <button type="submit" disabled={pending} className="link disabled:opacity-50">
        {pending ? "Emitindo..." : "Emitir nota fiscal"}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{state.error}</p>}
      {state?.avisoEmail && <p className="text-xs text-yellow-700 mt-1 max-w-xs">{state.avisoEmail}</p>}
    </form>
  );
}
