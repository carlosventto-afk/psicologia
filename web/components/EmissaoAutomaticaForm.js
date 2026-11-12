"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function EmissaoAutomaticaForm({ action, ativa, ambiente }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="card p-6 space-y-3">
      <p className="text-sm font-semibold text-navy">Emissão automática</p>
      <p className="text-sm text-navy">
        Estado atual: <span className="font-semibold">{ativa ? "ativada" : "desativada"}</span>
      </p>

      <label className="flex items-start gap-2 text-sm text-navy">
        <input
          key={String(ativa)}
          type="checkbox"
          name="emissao_automatica"
          defaultChecked={ativa}
          className="mt-0.5 h-4 w-4"
        />
        Emitir a NFS-e automaticamente ao receber uma cobrança
      </label>

      <p className="text-xs text-muted">
        Com a opção ligada, cada cobrança do tipo Nota Fiscal gera a nota assim que o recebimento é registrado, e
        a nota emitida tem efeito fiscal. Para ativar é preciso ter os dados fiscais salvos, o certificado digital
        enviado e o CRP cadastrado em Meus Dados.
      </p>
      {ambiente === "homologacao" && (
        <p className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          Você está em homologação: as notas são emitidas, mas NÃO são enviadas aos pacientes até a troca para
          produção.
        </p>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Configuração salva.</p>}

      <button type="submit" disabled={pending} className="btn-outline">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
