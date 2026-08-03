"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar } from "@/lib/actions/auth";

const estadoInicial = {};

export default function PaginaCadastro() {
  const [state, formAction, pending] = useActionState(cadastrar, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiFácil" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Criar Conta</h1>

        <div>
          <label htmlFor="nome" className="block text-sm font-semibold text-navy">
            Nome
          </label>
          <input id="nome" name="nome" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-navy">
            E-mail
          </label>
          <input id="email" name="email" type="email" required className="field" />
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
            minLength={6}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="contato" className="block text-sm font-semibold text-navy">
            Telefone
          </label>
          <input id="contato" name="contato" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="crp" className="block text-sm font-semibold text-navy">
            CRP (opcional)
          </label>
          <input id="crp" name="crp" type="text" className="field" />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Criando conta..." : "Criar conta grátis"}
        </button>

        <Link href="/login" className="block text-sm link text-center">
          Já tem conta? Entrar
        </Link>
      </form>
    </div>
  );
}
