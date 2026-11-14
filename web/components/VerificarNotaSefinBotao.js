"use client";

import { useActionState } from "react";
import { verificarNotaNaSefin } from "@/lib/actions/nota-verificar";

const estadoInicial = {};

// Mostrado só para notas pendentes (resultado incerto). O servidor revalida tudo.
export default function VerificarNotaSefinBotao({ notaId }) {
  const acao = verificarNotaNaSefin.bind(null, notaId);
  const [state, formAction, pending] = useActionState(acao, estadoInicial);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Verificando..." : "Verificar na SEFIN"}
      </button>
      {state?.error && <p className="mt-1 max-w-xs text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="mt-1 max-w-xs text-sm text-green-700">{state.mensagem}</p>}
    </form>
  );
}
