"use client";

import { useActionState } from "react";
import { atualizarSenha } from "@/lib/actions/auth";

const estadoInicial = {};

export default function PaginaRedefinirSenha() {
  const [state, formAction, pending] = useActionState(atualizarSenha, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <img src="/logo.svg" alt="PsiFácil" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Nova Senha</h1>

        <div>
          <label htmlFor="senha" className="block text-sm font-semibold text-navy">
            Nova senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={6}
            className="field"
          />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
