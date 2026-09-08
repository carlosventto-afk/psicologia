import Link from "next/link";
import { listarConsultorios } from "@/lib/data/consultorios";
import { listarAgenda } from "@/lib/data/sessoes";
import { resumoDoMes, listarInadimplentes, calcularPrevisto } from "@/lib/data/financeiro";
import { hojeISO } from "@/lib/periodo-agenda";
import { garantirRecorrenciasEstendidas } from "@/lib/recorrencia";
import { formatarMoeda } from "@/lib/formatar-moeda";

export default async function PaginaPainel() {
  const consultorios = await listarConsultorios();

  if (consultorios.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Resumo de Hoje</h1>
        <p className="empty-state">
          Você ainda não tem nenhum consultório cadastrado.{" "}
          <Link href="/consultorios/novo" className="link">
            Cadastrar o primeiro
          </Link>
          .
        </p>
      </div>
    );
  }

  await garantirRecorrenciasEstendidas();

  const hoje = hojeISO();
  const mesReferencia = hoje.slice(0, 7);

  const [atendimentosHoje, resumo, inadimplentes, previsto] = await Promise.all([
    listarAgenda({ dataInicio: hoje, dataFim: hoje }),
    resumoDoMes(mesReferencia),
    listarInadimplentes(),
    calcularPrevisto({ dataInicio: hoje, dataFim: hoje }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Resumo de Hoje</h1>

      <div className="flex flex-wrap gap-3">
        <Link href="/agenda" className="btn-primary">
          Ver Agenda
        </Link>
        <Link href="/pacientes/novo" className="btn-outline">
          Novo Paciente
        </Link>
        <Link
          href="/agenda/nova-sessao?voltarPara=%2F"
          className="btn-outline"
        >
          Nova Sessão
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Atendimentos de hoje</h2>
        {atendimentosHoje.length === 0 ? (
          <p className="empty-state">Nenhum atendimento hoje</p>
        ) : (
          <div className="space-y-3">
            {atendimentosHoje.map((s) => (
              <Link
                key={s.id}
                href={`/sessoes/${s.id}/editar?voltarPara=%2F`}
                className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-shadow hover:shadow-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-muted shrink-0">{s.horario}</span>
                  <span className="truncate font-semibold text-navy">{s.paciente_nome}</span>
                </div>
                <span className="text-muted">{s.status ?? "Marcada"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Financeiro</h2>
        <div className="card p-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted">Previsto (hoje)</p>
            <p className="text-lg font-semibold">{formatarMoeda(previsto)}</p>
          </div>
          <div>
            <p className="text-muted">Realizado (mês)</p>
            <p className="text-lg font-semibold text-green-700">{formatarMoeda(resumo.total_receita)}</p>
          </div>
          <div>
            <p className="text-muted">Inadimplentes</p>
            <p className="text-lg font-semibold text-red-600">{inadimplentes.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
