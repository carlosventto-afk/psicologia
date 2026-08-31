"use client";

export default function DesfazerRecebimentoBotao({ acao, mensagemConfirmacao, className, rotulo = "Desfazer" }) {
  function confirmarAntes(event) {
    if (!window.confirm(mensagemConfirmacao)) {
      event.preventDefault();
    }
  }

  return (
    <form action={acao} onSubmit={confirmarAntes}>
      <button type="submit" className={className}>
        {rotulo}
      </button>
    </form>
  );
}
