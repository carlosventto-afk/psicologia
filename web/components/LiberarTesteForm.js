"use client";

import { useState, useTransition } from "react";
import { liberarTestePlano } from "@/lib/actions/profissionais";

export default function LiberarTesteForm({ id }) {
  const [plano, setPlano] = useState("gestao");
  const [dias, setDias] = useState(14);
  const [erro, setErro] = useState("");
  const [pendente, startTransition] = useTransition();

  function enviar(e) {
    e.preventDefault();
    setErro("");
    startTransition(async () => {
      try {
        await liberarTestePlano(id, plano, Number(dias));
      } catch (err) {
        setErro(err.message || "Não foi possível liberar o teste.");
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-2">
      <select
        value={plano}
        onChange={(e) => setPlano(e.target.value)}
        className="field mt-0 w-auto text-sm"
        aria-label="Plano do teste"
      >
        <option value="gestao">Psi Gestão</option>
        <option value="gestao_marketing">Psi Gestão + Marketing</option>
        <option value="marketing">Psi Marketing</option>
      </select>
      <input
        type="number"
        min={1}
        max={90}
        value={dias}
        onChange={(e) => setDias(e.target.value)}
        className="field mt-0 w-20 text-sm"
        aria-label="Dias de teste"
      />
      <button type="submit" disabled={pendente} className="btn-outline text-sm">
        {pendente ? "Liberando..." : "Liberar teste"}
      </button>
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </form>
  );
}
