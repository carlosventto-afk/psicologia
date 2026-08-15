"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function AmbienteNfseForm({ action, ambiente }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  function confirmarAntes(event) {
    if (
      !window.confirm(
        "Trocar para PRODUÇÃO faz as próximas notas serem documentos fiscais REAIS. Essa troca não pode ser desfeita. Confirma?"
      )
    ) {
      event.preventDefault();
    }
  }

  if (ambiente === "producao") {
    return (
      <div className="card p-6">
        <p className="text-sm font-semibold text-navy">Ambiente: Produção</p>
        <p className="text-xs text-muted mt-1">As notas emitidas a partir de agora são documentos fiscais reais.</p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes} className="card p-6 space-y-3">
      <p className="text-sm font-semibold text-navy">Ambiente: Homologação (teste)</p>
      <p className="text-xs text-muted">
        Notas emitidas em homologação não são documentos fiscais reais. Troque para produção só quando tiver
        confirmado que a emissão de teste funcionou.
      </p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-outline">
        {pending ? "Trocando..." : "Trocar para Produção (irreversível)"}
      </button>
    </form>
  );
}
