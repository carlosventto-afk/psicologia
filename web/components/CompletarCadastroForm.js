"use client";

import { useActionState } from "react";
import { enviarPropostaCompletarCadastro } from "@/lib/actions/completar-cadastro";
import { CAMPOS_COMPLETAR_CADASTRO } from "@/lib/completar-cadastro-campos";

const estadoInicial = {};

export default function CompletarCadastroForm({ token, dados }) {
  const acaoComToken = enviarPropostaCompletarCadastro.bind(null, token);
  const [state, formAction, pending] = useActionState(acaoComToken, estadoInicial);

  if (state?.enviado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center">
        <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
        <div className="card p-8 max-w-sm space-y-2">
          <h1 className="page-title">Recebemos suas informações</h1>
          <p className="text-sm text-muted">
            O profissional vai revisar antes de atualizar seu cadastro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Olá, {dados.nome}</h1>
        <p className="text-sm text-muted">Confira e atualize suas informações de contato.</p>

        {CAMPOS_COMPLETAR_CADASTRO.map(({ chave, rotulo, tipo }) => (
          <div key={chave}>
            <label htmlFor={chave} className="block text-sm font-semibold text-navy">
              {rotulo}
            </label>
            <input
              id={chave}
              name={chave}
              type={tipo}
              defaultValue={dados[chave] ?? ""}
              className="field"
            />
          </div>
        ))}

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Enviando..." : "Enviar atualização"}
        </button>
      </form>
    </div>
  );
}
