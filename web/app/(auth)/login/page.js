"use client";

import { useActionState } from "react";
import Link from "next/link";
import { entrar } from "@/lib/actions/auth";

const estadoInicial = {};

export default function PaginaLogin() {
  const [state, formAction, pending] = useActionState(entrar, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Acessar Conta</h1>

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

        <div>
          <label htmlFor="senha" className="block text-sm font-semibold text-navy">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            className="field"
          />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>

        <Link href="/esqueci-senha" className="block text-sm link text-center">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="block text-sm link text-center">
          Não tem conta? Cadastre-se
        </Link>
      </form>
    </div>
  );
}
