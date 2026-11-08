"use client";

import { useState, useTransition } from "react";
import { cancelarCobranca } from "@/lib/actions/cobrancas";

export default function CancelarCobrancaBotao({ cobrancaId }) {
  const [erro, setErro] = useState(null);
  const [pending, startTransition] = useTransition();

  function cancelar() {
    if (!window.confirm("Cancelar esta cobrança? As sessões voltam a ficar disponíveis para nova cobrança.")) return;
    setErro(null);
    startTransition(async () => {
      const r = await cancelarCobranca(cobrancaId);
      if (r?.error) setErro(r.error);
    });
  }

  return (
    <div>
      <button type="button" onClick={cancelar} disabled={pending} className="link text-red-600 disabled:opacity-50">
        {pending ? "Cancelando..." : "Cancelar cobrança"}
      </button>
      {erro && <p className="text-sm text-red-600 mt-1">{erro}</p>}
    </div>
  );
}
