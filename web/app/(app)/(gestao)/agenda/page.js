import Link from "next/link";
import { listarAgenda, resumoAgenda } from "@/lib/data/sessoes";
import {
  calcularPeriodo,
  hojeISO,
  enumerarDatas,
  calcularGradeMes,
  deslocarData,
  formatarRotuloPeriodo,
} from "@/lib/periodo-agenda";
import { garantirRecorrenciasEstendidas } from "@/lib/recorrencia";
import { formatarMoeda } from "@/lib/formatar-moeda";
import AgendaGrade from "@/components/AgendaGrade";
import AgendaMes from "@/components/AgendaMes";
import CancelarSessaoButton from "@/components/CancelarSessaoButton";

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

  const resumirLocal = (lista) => {
    const validas = lista.filter((s) => s.status !== "Cancelada");
    return { quantidade: validas.length, valor: validas.reduce((soma, s) => soma + s.valor, 0) };
  };

  let resumos;
  if (visao === "dia") {
    const periodoSemana = calcularPeriodo("semana", data);
    const periodoMes = calcularPeriodo("mes", data);
    const [resumoSemana, resumoMes] = await Promise.all([
      resumoAgenda({ dataInicio: periodoSemana.inicio, dataFim: periodoSemana.fim }),
      resumoAgenda({ dataInicio: periodoMes.inicio, dataFim: periodoMes.fim }),
    ]);
    resumos = [
      { rotulo: "Dia", ...resumirLocal(sessoes) },
      { rotulo: "Semana", ...resumoSemana },
      { rotulo: "Mês", ...resumoMes },
    ];
  } else if (visao === "semana") {
    const periodoMes = calcularPeriodo("mes", data);
    const resumoMes = await resumoAgenda({ dataInicio: periodoMes.inicio, dataFim: periodoMes.fim });
    resumos = [
      { rotulo: "Semana", ...resumirLocal(sessoes) },
      { rotulo: "Mês", ...resumoMes },
    ];
  } else {
    resumos = [{ rotulo: "Mês", ...resumirLocal(sessoes) }];
  }

  const anterior = deslocarData(data, visao, -1);
  const proximo = deslocarData(data, visao, 1);
  const rotuloPeriodo = formatarRotuloPeriodo(visao, data, inicio, fim);
  const voltarParaAgenda = encodeURIComponent(`/agenda?visao=${visao}&data=${data}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Agenda</h1>
        <Link href={`/agenda/nova-sessao?voltarPara=${voltarParaAgenda}&data=${data}`} className="btn-primary">
          Nova Sessão
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {resumos.map((r) => (
          <div key={r.rotulo} className="card px-4 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.rotulo}</p>
            <p className="font-bold text-navy">
              {r.quantidade} atendimento{r.quantidade === 1 ? "" : "s"}{" "}
              <span className="font-normal text-muted">· {formatarMoeda(r.valor)}</span>
            </p>
          </div>
        ))}
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
        <AgendaGrade dias={enumerarDatas(inicio, fim)} sessoes={sessoes} visao={visao} data={data} />
      ) : sessoes.length === 0 ? (
        <p className="empty-state">Nenhuma sessão marcada.</p>
      ) : (
        <div className="space-y-3">
          {sessoes.map((s) => (
            <div
              key={s.id}
              className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-16 shrink-0 text-lg font-bold text-navy tabular-nums">
                  {s.horario?.slice(0, 5)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{s.paciente_nome}</p>
                  <p className="text-muted">{s.tipo_sessao}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted">{s.status ?? "Marcada"}</span>
                {!s.realizado && s.status !== "Cancelada" && (
                  <Link href={`/sessoes/${s.id}/registrar?voltarPara=${voltarParaAgenda}`} className="link">
                    Registrar Atendimento
                  </Link>
                )}
                {s.realizado && !s.pago && (
                  <Link href={`/sessoes/${s.id}/receber?voltarPara=${voltarParaAgenda}`} className="link">
                    Receber
                  </Link>
                )}
                {!s.realizado && (
                  <>
                    <Link href={`/sessoes/${s.id}/editar?voltarPara=${voltarParaAgenda}`} className="link">
                      Editar
                    </Link>
                    {s.status !== "Cancelada" && (
                      <CancelarSessaoButton
                        sessaoId={s.id}
                        recorrenciaId={s.recorrencia_id}
                        voltarPara={decodeURIComponent(voltarParaAgenda)}
                        className="link text-red-600"
                      >
                        Cancelar
                      </CancelarSessaoButton>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
