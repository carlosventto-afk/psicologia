"use client";

import { useState } from "react";
import { retomarAgenteLead } from "@/lib/actions/crm";

export default function BotaoRetomarAgente({ id }) {
  const [pending, setPending] = useState(false);

  async function aoClicar() {
    setPending(true);
    await retomarAgenteLead(id);
    setPending(false);
  }

  return (
    <button type="button" onClick={aoClicar} disabled={pending} className="btn-outline disabled:opacity-50">
      {pending ? "Devolvendo..." : "Devolver pro agente"}
    </button>
  );
}
