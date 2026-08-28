import Link from "next/link";
import { hojeISO } from "@/lib/periodo-agenda";

const DIAS_SEMANA_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function corPonto(status) {
  if (status === "Realizada") return "bg-green-600";
  if (status === "Cancelada") return "bg-muted";
  return "bg-primary";
}

export default function AgendaMes({ semanas, sessoes }) {
  const hoje = hojeISO();
  const porDia = {};
  for (const s of sessoes) {
    (porDia[s.data] ??= []).push(s);
  }

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-background">
        {DIAS_SEMANA_LABEL.map((rotulo) => (
          <div key={rotulo} className="text-center text-xs font-bold text-muted py-2">
            {rotulo}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {semanas.flat().map(({ data, noMes }) => {
          const sessoesDoDia = porDia[data] ?? [];
          const visiveis = sessoesDoDia.slice(0, 3);
          const restante = sessoesDoDia.length - visiveis.length;
          const pontos = sessoesDoDia.slice(0, 4);
          const pontosRestantes = sessoesDoDia.length - pontos.length;

          return (
            <Link
              key={data}
              href={`/agenda?visao=dia&data=${data}`}
              className={`min-h-[52px] sm:min-h-[92px] border-b border-r border-border p-1 sm:p-1.5 text-xs ${
                noMes ? "bg-white" : "bg-background/60"
              } ${data === hoje ? "ring-2 ring-inset ring-primary" : ""}`}
            >
              <p className={`font-semibold mb-1 ${noMes ? "text-navy" : "text-muted"}`}>
                {Number(data.slice(8, 10))}
              </p>

              {/* Mobile: só indicadores (bolinhas) — texto detalhado não cabe numa coluna estreita */}
              {sessoesDoDia.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                  {pontos.map((s) => (
                    <span key={s.id} className={`h-1.5 w-1.5 shrink-0 rounded-full ${corPonto(s.status)}`} />
                  ))}
                  {pontosRestantes > 0 && (
                    <span className="text-[10px] leading-none text-muted">+{pontosRestantes}</span>
                  )}
                </div>
              )}

              {/* Desktop/tablet: lista com horário + paciente */}
              <div className="hidden space-y-0.5 sm:block">
                {visiveis.map((s) => (
                  <p key={s.id} className="flex min-w-0 items-center gap-1 text-navy">
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${corPonto(s.status)}`} />
                    <span className="min-w-0 truncate">
                      {s.horario?.slice(0, 5)} {s.paciente_nome}
                    </span>
                  </p>
                ))}
                {restante > 0 && <p className="text-muted">+{restante} mais</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
