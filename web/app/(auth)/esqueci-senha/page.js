"use client";

import { useActionState } from "react";
import { enviarRecuperacaoSenha } from "@/lib/actions/auth";

const estadoInicial = {};

export default function PaginaEsqueciSenha() {
  const [state, formAction, pending] = useActionState(enviarRecuperacaoSenha, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Recuperar Senha</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-navy">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="field"
          />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.mensagem && <p className="text-sm text-green-700">{state.mensagem}</p>}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Enviando..." : "Enviar link de recuperação"}
        </button>
      </form>
    </div>
  );
}
