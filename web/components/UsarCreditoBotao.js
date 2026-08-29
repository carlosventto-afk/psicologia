"use client";

import { useState, useTransition } from "react";

export default function UsarCreditoBotao({ pacienteId, sessaoId, recebimentoId, valor, onUsarCredito }) {
  const [erro, setErro] = useState(null);
  const [pending, startTransition] = useTransition();

  function aoClicar() {
    setErro(null);
    startTransition(async () => {
      try {
        await onUsarCredito(pacienteId, sessaoId, recebimentoId);
      } catch (e) {
        setErro(e.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={aoClicar} disabled={pending} className="link disabled:opacity-50">
        {pending ? "Usando crédito..." : `Usar crédito (${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)} disponível)`}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
