"use client";

import { atualizarEstagioLead } from "@/lib/actions/crm";

const ESTAGIOS = [
  { valor: "novo", rotulo: "Novo" },
  { valor: "em_contato", rotulo: "Em contato" },
  { valor: "qualificado", rotulo: "Qualificado" },
  { valor: "proposta_enviada", rotulo: "Proposta enviada" },
  { valor: "fechado_ganho", rotulo: "Fechado (ganho)" },
  { valor: "perdido", rotulo: "Perdido" },
];

export default function SeletorEstagioLead({ id, estagioAtual }) {
  return (
    <select
      defaultValue={estagioAtual}
      onChange={(e) => atualizarEstagioLead(id, e.target.value)}
      className="field mt-0 w-auto text-sm"
    >
      {ESTAGIOS.map((e) => (
        <option key={e.valor} value={e.valor}>
          {e.rotulo}
        </option>
      ))}
    </select>
  );
}
