"use client";

import { useActionState } from "react";
import { vincularWhatsapp } from "@/lib/actions/whatsapp";

const estadoInicial = {};

export default function VincularWhatsappForm() {
  const [state, formAction, pending] = useActionState(vincularWhatsapp, estadoInicial);

  return (
    <div className="space-y-4">
      <form action={formAction} className="max-w-md space-y-4 card p-6">
        <div>
          <label htmlFor="whatsapp_number" className="block text-sm font-semibold text-navy">
            Número de WhatsApp
          </label>
          <input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            placeholder="+5511999999999"
            required
            className="field"
          />
          <p className="text-xs text-muted mt-1">
            Formato internacional, com código do país (ex: +55 para o Brasil).
          </p>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Gerando..." : "Gerar código"}
        </button>
      </form>

      {state?.codigo && (
        <div className="card p-6 max-w-md space-y-2">
          <p className="text-sm text-navy">
            Envie o código abaixo pelo WhatsApp para o número do assistente PsiAgente, dentro de 10 minutos:
          </p>
          <p className="text-3xl font-bold text-navy tracking-widest">{state.codigo}</p>
          <p className="text-xs text-muted">
            Número vinculado: {state.whatsappNumber}
          </p>
        </div>
      )}
    </div>
  );
}
