"use client";

import { useActionState } from "react";

const estadoInicial = {};

const OPCOES = [
  {
    valor: "atendimentos",
    rotulo: "Data do último atendimento da cobrança",
    ajuda: "Padrão. Com uma nota por sessão, a data de cada sessão.",
  },
  {
    valor: "pagamento",
    rotulo: "Data do pagamento informado na cobrança",
    ajuda: "A data informada ao receber a cobrança. A descrição da nota continua listando as datas dos atendimentos.",
  },
];

export default function CompetenciaNotaForm({ action, origem }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const atual = origem === "pagamento" ? "pagamento" : "atendimentos";

  return (
    <form action={formAction} className="card p-6 space-y-3">
      <p className="text-sm font-semibold text-navy">Competência da nota</p>
      <p className="text-sm text-muted">Qual data vai no campo de competência das próximas notas emitidas.</p>

      <fieldset className="space-y-2">
        <legend className="sr-only">Data de competência da nota</legend>
        {OPCOES.map((o) => (
          <label key={`${o.valor}-${atual}`} className="flex items-start gap-2 text-sm text-navy">
            <input
              type="radio"
              name="competencia_origem"
              value={o.valor}
              defaultChecked={atual === o.valor}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              {o.rotulo}
              <span className="block text-xs text-muted">{o.ajuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-xs text-muted">
        A competência define o mês de apuração do imposto. Use a data do pagamento só se você apura pelo regime de
        caixa; na dúvida, confirme com o seu contador. Notas já emitidas não mudam. Se a data do pagamento for
        futura, a nota só pode ser emitida a partir dela.
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Configuração salva.</p>}

      <button type="submit" disabled={pending} className="btn-outline">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
