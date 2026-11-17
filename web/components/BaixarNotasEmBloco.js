"use client";

import { useEffect, useState } from "react";

const FORM_ID = "form-download-notas";
const seletor = `input[name="id"][form="${FORM_ID}"]`;

// Barra de download em bloco. Os checkboxes ficam em cada cartão de nota (name="id",
// form=FORM_ID) — fora deste <form>, porque os cartões já têm formulários próprios
// (cancelar/verificar) e <form> aninhado não é válido. O envio é um GET nativo que
// baixa o .zip; o servidor revalida tudo.
export default function BaixarNotasEmBloco() {
  const [selecionadas, setSelecionadas] = useState(0);

  useEffect(() => {
    const contar = () => setSelecionadas(document.querySelectorAll(`${seletor}:checked`).length);
    document.addEventListener("change", contar);
    return () => document.removeEventListener("change", contar);
  }, []);

  function alternarTodas(e) {
    for (const c of document.querySelectorAll(seletor)) c.checked = e.target.checked;
    setSelecionadas(e.target.checked ? document.querySelectorAll(seletor).length : 0);
  }

  return (
    <form
      id={FORM_ID}
      method="get"
      action="/api/notas-fiscais/download"
      className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <label className="flex items-center gap-2 text-navy">
        <input type="checkbox" onChange={alternarTodas} aria-label="Selecionar todas as notas" />
        {selecionadas > 0 ? `${selecionadas} selecionada(s)` : "Selecionar todas"}
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="formato" value="pdf" disabled={selecionadas === 0} className="btn-primary disabled:opacity-50">
          Baixar PDFs (.zip)
        </button>
        <button type="submit" name="formato" value="xml" disabled={selecionadas === 0} className="btn-primary disabled:opacity-50">
          Baixar XMLs (.zip)
        </button>
        <button type="submit" name="formato" value="todos" disabled={selecionadas === 0} className="btn-primary disabled:opacity-50">
          PDF + XML (.zip)
        </button>
      </div>
    </form>
  );
}
