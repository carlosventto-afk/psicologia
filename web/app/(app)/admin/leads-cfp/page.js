import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { listarLeadsCfp } from "@/lib/data/leads";

export default async function PaginaLeadsCfp({ searchParams }) {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const { q = "", pagina: paginaParam = "1" } = await searchParams;
  const pagina = Math.max(1, Number(paginaParam) || 1);
  const { leads, total, totalPaginas } = await listarLeadsCfp({ busca: q, pagina });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Leads CFP (RJ)</h1>
        <p className="text-sm text-muted">{total} psicólogo(s) ativo(s) encontrado(s)</p>
      </div>

      <form className="sm:max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="field mt-0"
        />
      </form>

      {leads.length === 0 ? (
        <p className="empty-state">Nenhum lead encontrado.</p>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => (
            <div
              key={l.crp_registro}
              className="card flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="truncate font-semibold text-navy">{l.nome}</p>
              <p className="text-sm text-muted">
                CRP {l.crp_regiao}/{l.crp_registro} · Inscrito em {String(l.data_inscricao).slice(0, 10)}
              </p>
            </div>
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pagina > 1 ? (
            <Link href={`?q=${encodeURIComponent(q)}&pagina=${pagina - 1}`} className="btn-outline">
              Anterior
            </Link>
          ) : (
            <span className="btn-outline pointer-events-none opacity-50">Anterior</span>
          )}
          <span className="text-muted">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={`?q=${encodeURIComponent(q)}&pagina=${pagina + 1}`} className="btn-outline">
              Próxima
            </Link>
          ) : (
            <span className="btn-outline pointer-events-none opacity-50">Próxima</span>
          )}
        </div>
      )}
    </div>
  );
}
