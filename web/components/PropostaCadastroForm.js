"use client";

import { useActionState } from "react";
import { CAMPOS_COMPLETAR_CADASTRO } from "@/lib/completar-cadastro-campos";

const estadoInicial = {};

export default function PropostaCadastroForm({ paciente, proposta, acaoAceitar, acaoRejeitar }) {
  const [stateAceitar, formActionAceitar, pendingAceitar] = useActionState(acaoAceitar, estadoInicial);
  const [stateRejeitar, formActionRejeitar, pendingRejeitar] = useActionState(acaoRejeitar, estadoInicial);

  return (
    <div className="space-y-4">
      {proposta.status === "rejeitada" && (
        <p className="text-sm text-muted">
          Rejeitada em{" "}
          {new Date(proposta.decidido_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, ainda pode
          aceitar até{" "}
          {new Date(proposta.prazoAceite).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
      )}

      <form action={formActionAceitar} className="card p-6 space-y-4">
        {CAMPOS_COMPLETAR_CADASTRO.map(({ chave, rotulo }) => {
          const vaiApagar = !proposta[`${chave}_pendente`] && paciente[chave];
          return (
            <div key={chave} className="flex items-start gap-3">
              <input
                type="checkbox"
                id={`campo_${chave}`}
                name="campos"
                value={chave}
                defaultChecked={!vaiApagar}
                className="mt-1"
              />
              <label htmlFor={`campo_${chave}`} className="text-sm flex-1">
                <span className="block font-semibold text-navy">{rotulo}</span>
                <span className="block text-muted">Atual: {paciente[chave] || "—"}</span>
                {vaiApagar ? (
                  <span className="block text-red-600">Proposto: (vazio — este campo será apagado)</span>
                ) : (
                  <span className="block">Proposto: {proposta[`${chave}_pendente`] || "—"}</span>
                )}
              </label>
            </div>
          );
        })}

        {stateAceitar?.error && <p className="text-sm text-red-600">{stateAceitar.error}</p>}

        <button type="submit" disabled={pendingAceitar} className="btn-primary disabled:opacity-50">
          {pendingAceitar
            ? "Aplicando..."
            : proposta.status === "rejeitada"
              ? "Aceitar mesmo assim"
              : "Aceitar selecionados"}
        </button>
      </form>

      {proposta.status === "pendente" && (
        <form action={formActionRejeitar}>
          {stateRejeitar?.error && <p className="text-sm text-red-600">{stateRejeitar.error}</p>}
          <button type="submit" disabled={pendingRejeitar} className="link text-red-600 disabled:opacity-50">
            {pendingRejeitar ? "Rejeitando..." : "Rejeitar"}
          </button>
        </form>
      )}
    </div>
  );
}
