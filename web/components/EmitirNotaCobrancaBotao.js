"use client";

import { useState, useTransition } from "react";
import { emitirNotaDaCobranca } from "@/lib/actions/nota-cobranca";

// `rotulo`: "Emitir nota" ou "Tentar de novo" (decidido no servidor por rotuloBotaoNota).
export default function EmitirNotaCobrancaBotao({ cobrancaId, rotulo }) {
  const [erro, setErro] = useState(null);
  const [pending, startTransition] = useTransition();

  function emitir() {
    setErro(null);
    startTransition(async () => {
      const r = await emitirNotaDaCobranca(cobrancaId);
      if (r?.error) setErro(r.error);
    });
  }

  return (
    <div>
      <button type="button" onClick={emitir} disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Emitindo..." : rotulo}
      </button>
      {erro && <p className="mt-1 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
