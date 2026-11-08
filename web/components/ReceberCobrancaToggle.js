"use client";

import { useState } from "react";
import ReceberCobrancaForm from "@/components/ReceberCobrancaForm";

export default function ReceberCobrancaToggle({ cobrancaId, contas, hoje }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAberto((a) => !a)} className="link">
        {aberto ? "Fechar" : "Receber"}
      </button>
      {aberto && <ReceberCobrancaForm cobrancaId={cobrancaId} contas={contas} hoje={hoje} />}
    </div>
  );
}
