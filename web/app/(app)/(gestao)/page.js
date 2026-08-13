import Link from "next/link";
import { listarConsultorios } from "@/lib/data/consultorios";
import { listarAgenda } from "@/lib/data/sessoes";
import { resumoDoMes, listarInadimplentes, calcularPrevisto } from "@/lib/data/financeiro";
import { hojeISO } from "@/lib/periodo-agenda";
import { garantirRecorrenciasEstendidas } from "@/lib/recorrencia";

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

      <div className="flex gap-3">
        <Link href="/agenda" className="btn-primary">
          Ver Agenda
        </Link>
        <Link href="/pacientes/novo" className="btn-outline">
          Novo Paciente
        </Link>
        <Link
          href="/agenda/nova-sessao"
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
                href={`/sessoes/${s.id}/editar`}
                className="card flex items-center justify-between px-4 py-3 text-sm transition-shadow hover:shadow-md"
              >
                <span className="text-muted w-16">{s.horario}</span>
                <span className="font-semibold text-navy flex-1 px-3">{s.paciente_nome}</span>
                <span>{s.status ?? "Marcada"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Financeiro</h2>
        <div className="card p-5 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted">Previsto (hoje)</p>
            <p className="text-lg font-semibold">R$ {previsto.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted">Realizado (mês)</p>
            <p className="text-lg font-semibold text-green-700">R$ {resumo.total_receita}</p>
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
