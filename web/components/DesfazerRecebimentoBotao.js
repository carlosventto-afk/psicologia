"use client";

import { useActionState } from "react";

// `acao` pode devolver { error } (ex.: nota fiscal ativa na cobranca); o texto aparece abaixo do botao.
export default function DesfazerRecebimentoBotao({ acao, mensagemConfirmacao, className, rotulo = "Desfazer" }) {
  const [state, formAction] = useActionState(async (_anterior, formData) => (await acao(formData)) ?? null, null);

  function confirmarAntes(event) {
    if (!window.confirm(mensagemConfirmacao)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes}>
      <button type="submit" className={className}>
        {rotulo}
      </button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
