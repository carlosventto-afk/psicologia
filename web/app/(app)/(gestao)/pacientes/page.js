import Link from "next/link";
import { listarPacientes } from "@/lib/data/pacientes";
import { formatarMoeda } from "@/lib/formatar-moeda";

const ABAS_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

export default async function PaginaPacientes({ searchParams }) {
  const { q = "", status = "ativos" } = await searchParams;
  const pacientes = await listarPacientes({ busca: q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Pacientes</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/pacientes/importar" className="btn-outline">
            Importar planilha
          </Link>
          <Link href="/pacientes/novo" className="btn-primary">
            Novo Paciente
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="sm:max-w-sm sm:flex-1">
          <input type="hidden" name="status" value={status} />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome..."
            className="field mt-0"
          />
        </form>

        <div className="flex flex-wrap gap-1 text-sm">
          {ABAS_STATUS.map((aba) => (
            <Link
              key={aba.valor}
              href={q ? `?status=${aba.valor}&q=${encodeURIComponent(q)}` : `?status=${aba.valor}`}
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                status === aba.valor ? "bg-primary/10 text-primary" : "text-muted hover:bg-background"
              }`}
            >
              {aba.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {pacientes.length === 0 ? (
        <p className="empty-state">Nenhum paciente encontrado.</p>
      ) : (
        <div className="space-y-3">
          {pacientes.map((p) => (
            <Link
              key={p.id}
              href={`/pacientes/${p.id}`}
              className="card flex flex-col gap-1 px-4 py-3 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{p.nome}</p>
                <p className="text-sm text-muted">
                  {formatarMoeda(p.valor_sessao)}
                  {p.responsaveis_financeiros.length > 0 && ` · Resp.: ${p.responsaveis_financeiros.join(", ")}`}
                </p>
              </div>
              <p className="text-sm text-muted shrink-0">
                {p.proxima_sessao
                  ? `Próxima sessão: ${p.proxima_sessao.data} ${p.proxima_sessao.horario}`
                  : "Sem sessão marcada"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
