"use client";

import { useActionState, useRef, useState } from "react";
import CancelarSessaoButton from "@/components/CancelarSessaoButton";

const estadoInicial = {};

export default function SessaoEditForm({ action, sessao, pacientes, tiposAtendimento, voltarPara }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const formRef = useRef(null);
  const aplicarSerieRef = useRef(null);

  // React 19 dispara a Server Action de `action={formAction}` assim que o
  // form recebe um evento "submit" nativo — um preventDefault() no onSubmit
  // não impede isso (só cancela a navegação default do browser, não o
  // dispatch interno da action). Por isso o botão "Salvar" não é
  // type="submit": a decisão de chamar requestSubmit() é sempre nossa.
  function handleClickSalvar() {
    const form = formRef.current;
    if (!form) return;

    const mudouDataOuHorario = form.data.value !== sessao.data || form.horario.value !== sessao.horario;

    if (sessao.recorrencia_id && mudouDataOuHorario) {
      setMostrarConfirmacao(true);
      return;
    }

    form.requestSubmit();
  }

  function confirmarEscolha(aplicarATodasAsFuturas) {
    if (aplicarSerieRef.current) {
      aplicarSerieRef.current.value = aplicarATodasAsFuturas ? "true" : "false";
    }
    setMostrarConfirmacao(false);
    formRef.current?.requestSubmit();
  }

  // Sem isso, Enter num campo de texto dispara o submit nativo do form (e a
  // action junto), pulando a checagem acima — força tudo a passar pelo botão.
  function bloquearSubmitPeloEnter(event) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  if (sessao.realizado) {
    return (
      <div className="max-w-md card p-6">
        <p className="text-sm text-muted">
          Esta sessão já foi registrada como realizada e não pode mais ser editada ou cancelada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} onKeyDown={bloquearSubmitPeloEnter} className="max-w-md space-y-4 card p-6">
        <input type="hidden" name="aplicar_serie" defaultValue="false" ref={aplicarSerieRef} />
        {voltarPara && <input type="hidden" name="voltar_para" value={voltarPara} />}

        <div>
          <label htmlFor="paciente" className="block text-sm font-semibold text-navy">
            Paciente
          </label>
          <select
            id="paciente"
            name="paciente"
            required
            defaultValue={sessao.paciente_id}
            className="field"
          >
            <option value="" disabled>
              Selecione
            </option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="data" className="block text-sm font-semibold text-navy">
            Data
          </label>
          <input
            id="data"
            name="data"
            type="date"
            required
            defaultValue={sessao.data}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="horario" className="block text-sm font-semibold text-navy">
            Horário
          </label>
          <input
            id="horario"
            name="horario"
            type="time"
            required
            defaultValue={sessao.horario}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="duracao_min" className="block text-sm font-semibold text-navy">
            Duração (minutos)
          </label>
          <input
            id="duracao_min"
            name="duracao_min"
            type="number"
            min="1"
            required
            defaultValue={sessao.duracao_min}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="tipo_sessao" className="block text-sm font-semibold text-navy">
            Tipo de Atendimento
          </label>
          <select
            id="tipo_sessao"
            name="tipo_sessao"
            required
            defaultValue={sessao.tipo_sessao ?? ""}
            className="field"
          >
            <option value="" disabled>
              Selecione
            </option>
            {tiposAtendimento.map((t) => (
              <option key={t.id} value={t.Nome}>
                {t.Nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">
            Alterar o tipo aqui afeta só esta sessão, não a série de recorrência.
          </p>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="button" onClick={handleClickSalvar} disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>

      {sessao.status !== "Cancelada" && (
        <div className="max-w-md">
          <CancelarSessaoButton sessaoId={sessao.id} recorrenciaId={sessao.recorrencia_id} voltarPara={voltarPara} className="btn-danger">
            Cancelar esta sessão
          </CancelarSessaoButton>
        </div>
      )}

      {mostrarConfirmacao && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMostrarConfirmacao(false)}
            aria-hidden="true"
          />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
              <div>
                <h2 className="text-base font-semibold text-navy">Aplicar alteração à série?</h2>
                <p className="text-sm text-muted mt-1">
                  Esta sessão faz parte de uma recorrência. Deseja aplicar a nova data/horário somente a esta sessão
                  ou a todas as sessões futuras da série?
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => confirmarEscolha(true)} className="btn-primary">
                  Sim, aplicar a todas as futuras
                </button>
                <button type="button" onClick={() => confirmarEscolha(false)} className="btn-secondary">
                  Não, somente esta sessão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
