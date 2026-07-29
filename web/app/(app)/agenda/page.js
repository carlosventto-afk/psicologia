import Link from "next/link";
import { listarAgenda } from "@/lib/data/sessoes";
import {
  calcularPeriodo,
  hojeISO,
  enumerarDatas,
  calcularGradeMes,
  deslocarData,
  formatarRotuloPeriodo,
} from "@/lib/periodo-agenda";
import { garantirRecorrenciasEstendidas } from "@/lib/recorrencia";
import AgendaGrade from "@/components/AgendaGrade";
import AgendaMes from "@/components/AgendaMes";

const ABAS = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

export default async function PaginaAgenda({ searchParams }) {
  const { visao = "dia", data = hojeISO() } = await searchParams;
  const { inicio, fim } = calcularPeriodo(visao, data);

  await garantirRecorrenciasEstendidas();
  const sessoes = await listarAgenda({ dataInicio: inicio, dataFim: fim });

  const anterior = deslocarData(data, visao, -1);
  const proximo = deslocarData(data, visao, 1);
  const rotuloPeriodo = formatarRotuloPeriodo(visao, data, inicio, fim);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Agenda</h1>
        <Link href="/agenda/nova-sessao" className="btn-primary">
          Nova Sessão
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/agenda?visao=${visao}&data=${anterior}`}
            className="btn-outline px-3 py-1.5"
            aria-label="Período anterior"
          >
            ‹
          </Link>
          <Link href={`/agenda?visao=${visao}&data=${hojeISO()}`} className="btn-outline py-1.5">
            Hoje
          </Link>
          <Link
            href={`/agenda?visao=${visao}&data=${proximo}`}
            className="btn-outline px-3 py-1.5"
            aria-label="Próximo período"
          >
            ›
          </Link>
          <span className="text-sm font-bold text-navy ml-2">{rotuloPeriodo}</span>
        </div>

        <div className="flex gap-2">
          {ABAS.map((aba) => (
            <Link
              key={aba.valor}
              href={`/agenda?visao=${aba.valor}&data=${data}`}
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                visao === aba.valor ? "bg-primary text-white" : "bg-white text-navy border border-border"
              }`}
            >
              {aba.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {visao === "mes" ? (
        <AgendaMes semanas={calcularGradeMes(data)} sessoes={sessoes} />
      ) : visao === "semana" ? (
        <AgendaGrade dias={enumerarDatas(inicio, fim)} sessoes={sessoes} />
      ) : sessoes.length === 0 ? (
        <p className="empty-state">Nenhuma sessão marcada.</p>
      ) : (
        <div className="card divide-y">
          {sessoes.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-navy">{s.paciente_nome}</p>
                <p className="text-muted">
                  {s.data} {s.horario?.slice(0, 5)} · {s.tipo_sessao}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted">{s.status ?? "Marcada"}</span>
                {!s.realizado && s.status !== "Cancelada" && (
                  <Link href={`/sessoes/${s.id}/registrar`} className="link">
                    Registrar Atendimento
                  </Link>
                )}
                {s.realizado && !s.pago && (
                  <Link href={`/sessoes/${s.id}/pagamento`} className="link">
                    Registrar Pagamento
                  </Link>
                )}
                <Link href={`/sessoes/${s.id}/editar`} className="link">
                  Editar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
