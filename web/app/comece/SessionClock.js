"use client";

import { useEffect, useRef, useState } from "react";

const ETAPAS = [
  { id: "chegada", rotulo: "Chegada" },
  { id: "pesa", rotulo: "O que pesa" },
  { id: "muda", rotulo: "O que muda" },
  { id: "comeca", rotulo: "Como começa" },
  { id: "marcar", rotulo: "Marcar sessão" },
];

export default function SessionClock() {
  const [progresso, setProgresso] = useState(0);
  const [etapaAtiva, setEtapaAtiva] = useState(0);
  const quadroRef = useRef(null);

  useEffect(() => {
    function atualizar() {
      if (quadroRef.current) return;
      quadroRef.current = requestAnimationFrame(() => {
        const altura = document.documentElement.scrollHeight - window.innerHeight;
        const p = altura > 0 ? Math.min(1, Math.max(0, window.scrollY / altura)) : 0;
        setProgresso(p);

        let atual = 0;
        ETAPAS.forEach((etapa, i) => {
          const el = document.getElementById(etapa.id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.5) {
            atual = i;
          }
        });
        setEtapaAtiva(atual);
        quadroRef.current = null;
      });
    }

    window.addEventListener("scroll", atualizar, { passive: true });
    atualizar();
    return () => window.removeEventListener("scroll", atualizar);
  }, []);

  const minuto = Math.min(50, Math.round(progresso * 50));

  return (
    <>
      {/* Mobile: barra fina no topo */}
      <div
        aria-hidden="true"
        className="lg:hidden fixed top-0 inset-x-0 z-40 h-1 bg-[var(--border)]"
      >
        <div
          className="h-full bg-[var(--moss)]"
          style={{ width: `${progresso * 100}%` }}
        />
      </div>

      {/* Desktop: trilha vertical com etapas */}
      <div
        aria-hidden="true"
        className="hidden lg:flex fixed left-6 top-0 h-screen z-40 flex-col items-center py-16"
      >
        <div className="relative flex-1 w-px bg-[var(--border)]">
          <div
            className="absolute left-1/2 -translate-x-1/2 w-px bg-[var(--moss)] top-0"
            style={{ height: `${progresso * 100}%` }}
          />
          {ETAPAS.map((etapa, i) => (
            <div
              key={etapa.id}
              className="absolute left-1/2 -translate-x-1/2 flex items-center"
              style={{ top: `${(i / (ETAPAS.length - 1)) * 100}%` }}
            >
              <span
                className={`block h-2 w-2 rounded-full border transition-colors ${
                  i <= etapaAtiva
                    ? "bg-[var(--moss)] border-[var(--moss)]"
                    : "bg-[var(--paper)] border-[var(--border)]"
                }`}
              />
              <span
                className={`absolute left-4 whitespace-nowrap text-xs font-semibold tracking-wide transition-colors ${
                  i === etapaAtiva ? "text-[var(--moss-dark)]" : "text-[var(--ink-soft)] opacity-0"
                }`}
              >
                {etapa.rotulo}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs font-bold tabular-nums text-[var(--moss-dark)]">
          {String(minuto).padStart(2, "0")}′/50′
        </div>
      </div>
    </>
  );
}
