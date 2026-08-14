"use client";

export default function ExcluirLancamentoBotao({ action }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Excluir este lançamento? Se ele vier de um pagamento de sessão, o pagamento também será removido."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline">
        Excluir
      </button>
    </form>
  );
}
