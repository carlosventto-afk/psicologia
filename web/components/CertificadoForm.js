"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function CertificadoForm({ action, dadosFiscais }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-4 card p-6">
      <h2 className="text-lg font-bold text-navy">Certificado digital (A1)</h2>

      {dadosFiscais?.certificado_titular && (
        <p className="text-sm text-muted">
          Certificado atual: <strong>{dadosFiscais.certificado_titular}</strong>
          {dadosFiscais.certificado_validade && <> — válido até {dadosFiscais.certificado_validade}</>}
        </p>
      )}

      <div>
        <label htmlFor="certificado" className="block text-sm font-semibold text-navy">
          Arquivo .pfx
        </label>
        <input id="certificado" name="certificado" type="file" accept=".pfx" required className="field" />
      </div>

      <div>
        <label htmlFor="senha_certificado" className="block text-sm font-semibold text-navy">
          Senha do certificado
        </label>
        <input id="senha_certificado" name="senha_certificado" type="password" required className="field" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && (
        <p className="text-sm text-green-700">
          Certificado validado e salvo.
          {state.avisoTitularidade && <span className="block text-yellow-700 mt-1">{state.avisoTitularidade}</span>}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Enviando..." : "Enviar certificado"}
      </button>
    </form>
  );
}
