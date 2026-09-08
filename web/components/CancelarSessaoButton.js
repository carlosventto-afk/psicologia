"use client";

import { useRef, useState } from "react";
import { cancelarSessao } from "@/lib/actions/sessoes";

export default function CancelarSessaoButton({ sessaoId, recorrenciaId, voltarPara, className, children }) {
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const formRef = useRef(null);
  const aplicarSerieRef = useRef(null);

  function handleClick() {
    setMostrarConfirmacao(true);
  }

  function confirmar(aplicarATodasAsFuturas) {
    if (aplicarSerieRef.current) {
      aplicarSerieRef.current.value = aplicarATodasAsFuturas ? "true" : "false";
    }
    setMostrarConfirmacao(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={cancelarSessao.bind(null, sessaoId)}>
        <input type="hidden" name="aplicar_serie" defaultValue="false" ref={aplicarSerieRef} />
        {voltarPara && <input type="hidden" name="voltar_para" value={voltarPara} />}
        <button type="button" onClick={handleClick} className={className}>
          {children ?? "Cancelar"}
        </button>
      </form>

      {mostrarConfirmacao && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMostrarConfirmacao(false)}
            aria-hidden="true"
          />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
              {recorrenciaId ? (
                <>
                  <div>
                    <h2 className="text-base font-semibold text-navy">Cancelar esta sessão?</h2>
                    <p className="text-sm text-muted mt-1">
                      Esta sessão faz parte de uma recorrência. Deseja cancelar somente esta sessão ou também todas as
                      sessões futuras da série? Essa ação não pode ser desfeita.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => confirmar(true)} className="btn-danger">
                      Cancelar esta e todas as futuras
                    </button>
                    <button type="button" onClick={() => confirmar(false)} className="btn-secondary">
                      Cancelar somente esta sessão
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className="text-base font-semibold text-navy">Cancelar esta sessão?</h2>
                    <p className="text-sm text-muted mt-1">
                      Tem certeza que deseja cancelar esta sessão? Essa ação não pode ser desfeita.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => confirmar(false)} className="btn-danger">
                      Sim, cancelar sessão
                    </button>
                    <button type="button" onClick={() => setMostrarConfirmacao(false)} className="btn-secondary">
                      Voltar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
