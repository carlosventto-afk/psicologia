import Link from "next/link";
import { diaDaSemanaAbreviado, hojeISO } from "@/lib/periodo-agenda";

function corCartao(status) {
  if (status === "Realizada") return "border-l-green-600 bg-green-50";
  if (status === "Cancelada") return "border-l-border bg-background text-muted line-through";
  return "border-l-primary bg-primary/10";
}

export default function AgendaGrade({ dias, sessoes }) {
  const hoje = hojeISO();
  const porDia = Object.fromEntries(dias.map((d) => [d, []]));
  for (const s of sessoes) {
    porDia[s.data]?.push(s);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max">
        {dias.map((d) => (
          <div key={d} className="w-48 shrink-0">
            <div
              className={`text-center text-sm font-bold py-2 rounded-t-xl border border-b-0 border-border ${
                d === hoje ? "bg-primary text-white" : "bg-white text-navy"
              }`}
            >
              {diaDaSemanaAbreviado(d).toUpperCase()} · {d.slice(8, 10)}/{d.slice(5, 7)}
            </div>
            <div className="border border-border rounded-b-xl bg-background/50 p-2 space-y-2 min-h-[140px]">
              {porDia[d].length === 0 ? (
                <p className="text-xs text-muted text-center py-3">—</p>
              ) : (
                porDia[d].map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessoes/${s.id}/editar`}
                    className={`block rounded-lg border-l-4 px-2 py-1.5 text-xs shadow-sm ${corCartao(s.status)}`}
                  >
                    <p className="font-bold">{s.horario?.slice(0, 5)}</p>
                    <p className="font-semibold truncate">{s.paciente_nome}</p>
                    <p className="text-muted truncate">{s.tipo_sessao}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
