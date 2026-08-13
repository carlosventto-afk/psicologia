"use client";

import { alterarPlano } from "@/lib/actions/profissionais";

export default function SeletorPlano({ id, planoAtual }) {
  return (
    <select
      defaultValue={planoAtual}
      onChange={(e) => alterarPlano(id, e.target.value)}
      className="field mt-0 w-auto text-sm"
    >
      <option value="gestao">Psi Gestão</option>
      <option value="gestao_marketing">Psi Gestão + Marketing</option>
      <option value="marketing">Psi Marketing</option>
    </select>
  );
}
