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

          return (
            <Link
              key={data}
              href={`/agenda?visao=dia&data=${data}`}
              className={`min-h-[92px] border-b border-r border-border p-1.5 text-xs ${
                noMes ? "bg-white" : "bg-background/60"
              } ${data === hoje ? "ring-2 ring-inset ring-primary" : ""}`}
            >
              <p className={`font-semibold mb-1 ${noMes ? "text-navy" : "text-muted"}`}>
                {Number(data.slice(8, 10))}
              </p>
              <div className="space-y-0.5">
                {visiveis.map((s) => (
                  <p key={s.id} className="truncate flex items-center gap-1 text-navy">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${corPonto(s.status)}`} />
                    {s.horario?.slice(0, 5)} {s.paciente_nome}
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
