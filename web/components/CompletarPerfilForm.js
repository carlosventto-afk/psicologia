"use client";

import { useActionState } from "react";
import { completarPerfilGoogle } from "@/lib/actions/auth";

const estadoInicial = {};

export default function CompletarPerfilForm({ nomeSugerido, email, next }) {
  const [state, formAction, pending] = useActionState(completarPerfilGoogle, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Complete seu cadastro</h1>
        <p className="text-sm text-muted">
          Falta só o seu telefone pra terminar de criar sua conta.
        </p>

        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="nome" className="block text-sm font-semibold text-navy">
            Nome
          </label>
          <input id="nome" name="nome" type="text" defaultValue={nomeSugerido} required className="field" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy">E-mail</label>
          <p className="field bg-gray-50 text-muted">{email}</p>
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

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Salvando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
