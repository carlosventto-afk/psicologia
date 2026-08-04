"use client";

import { useState } from "react";

export default function BotaoCompartilharPerfil({ url }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button type="button" onClick={copiar} className="btn-outline">
      {copiado ? "Link copiado!" : "Compartilhar meu perfil"}
    </button>
  );
}
