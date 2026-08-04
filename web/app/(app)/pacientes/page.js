import Link from "next/link";
import { listarPacientes } from "@/lib/data/pacientes";

export default async function PaginaPacientes({ searchParams }) {
  const { q = "" } = await searchParams;
  const pacientes = await listarPacientes({ busca: q });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Pacientes</h1>
        <div className="flex gap-3">
          <Link href="/pacientes/importar" className="btn-outline">
            Importar planilha
          </Link>
          <Link href="/pacientes/novo" className="btn-primary">
            Novo Paciente
          </Link>
        </div>
      </div>

      <form className="max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="field mt-0"
        />
      </form>

      {pacientes.length === 0 ? (
        <p className="empty-state">Nenhum paciente cadastrado.</p>
      ) : (
        <div className="card divide-y">
          {pacientes.map((p) => (
            <Link
              key={p.id}
              href={`/pacientes/${p.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-background"
            >
              <p className="font-semibold text-navy">{p.nome}</p>
              <p className="text-sm text-muted">
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
