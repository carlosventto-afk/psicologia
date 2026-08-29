"use client";

import { useActionState, useState } from "react";

const estadoInicial = {};

export default function ResponsaveisFinanceirosPaciente({
  responsaveis,
  paraVincular,
  vincularExistenteAction,
  criarEVincularAction,
  onDesvincular,
}) {
  const [stateVincular, formActionVincular, pendingVincular] = useActionState(vincularExistenteAction, estadoInicial);
  const [stateCriar, formActionCriar, pendingCriar] = useActionState(criarEVincularAction, estadoInicial);
  const [mostrarNovo, setMostrarNovo] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {responsaveis.map((r) => (
          <div key={r.id} className="card flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {r.nome}
              {r.eh_proprio && <span className="text-muted"> (o próprio paciente)</span>}
            </span>
            {!r.eh_proprio && (
              <form action={onDesvincular.bind(null, r.id)}>
                <button type="submit" className="link text-red-600">
                  Desvincular
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {paraVincular.length > 0 && (
        <form action={formActionVincular} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="responsavel_id" className="block text-sm font-semibold text-navy">
              Vincular responsável existente
            </label>
            <select id="responsavel_id" name="responsavel_id" required className="field">
              <option value="" disabled selected>
                Selecione
              </option>
              {paraVincular.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pendingVincular} className="btn-outline disabled:opacity-50">
            {pendingVincular ? "Vinculando..." : "Vincular"}
          </button>
          {stateVincular?.error && <p className="w-full text-sm text-red-600">{stateVincular.error}</p>}
        </form>
      )}

      {!mostrarNovo ? (
        <button type="button" onClick={() => setMostrarNovo(true)} className="link">
          + Criar novo responsável financeiro
        </button>
      ) : (
        <form action={formActionCriar} className="card space-y-3 p-4">
          <div>
            <label htmlFor="novo_nome" className="block text-sm font-semibold text-navy">
              Nome
            </label>
            <input id="novo_nome" name="nome" type="text" required className="field" />
          </div>
          <div>
            <label htmlFor="novo_cpf_cnpj" className="block text-sm font-semibold text-navy">
              CPF/CNPJ (opcional)
            </label>
            <input id="novo_cpf_cnpj" name="cpf_cnpj" type="text" className="field" />
          </div>
          <div>
            <label htmlFor="novo_telefone" className="block text-sm font-semibold text-navy">
              Telefone (opcional)
            </label>
            <input id="novo_telefone" name="telefone" type="text" className="field" />
          </div>
          <div>
            <label htmlFor="novo_email" className="block text-sm font-semibold text-navy">
              E-mail (opcional)
            </label>
            <input id="novo_email" name="email" type="email" className="field" />
          </div>
          {stateCriar?.error && <p className="text-sm text-red-600">{stateCriar.error}</p>}
          <button type="submit" disabled={pendingCriar} className="btn-primary disabled:opacity-50">
            {pendingCriar ? "Salvando..." : "Criar e vincular"}
          </button>
        </form>
      )}
    </div>
  );
}
