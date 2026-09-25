import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { estatisticasVisitantes, HOSTS_RASTREADOS } from "@/lib/data/visitantes";
import BarraEstatistica from "@/components/BarraEstatistica";
import GraficoDiario from "@/components/GraficoDiario";

const PERIODOS = [7, 30, 90];

export default async function PaginaVisitantes({ searchParams }) {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const { dias: diasParam = "30", host: hostParam = "todos" } = await searchParams;
  const dias = PERIODOS.includes(Number(diasParam)) ? Number(diasParam) : 30;
  const host =
    hostParam === "todos" || HOSTS_RASTREADOS.some((h) => h.host === hostParam) ? hostParam : "todos";

  const stats = await estatisticasVisitantes({ dias, host });
  const maxPagina = Math.max(1, ...stats.topPaginas.map((p) => p.total));
  const maxReferrer = Math.max(1, ...stats.topReferrers.map((r) => r.total));
  const maxCampanha = Math.max(1, ...stats.topCampanhas.map((c) => c.total));
  const maxHost = Math.max(1, ...stats.porHost.map((h) => h.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Visitantes</h1>
        <p className="text-sm text-muted">Últimos {dias} dias</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Período</label>
          <select name="dias" defaultValue={String(dias)} className="field mt-0">
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {p} dias
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Site</label>
          <select name="host" defaultValue={host} className="field mt-0">
            <option value="todos">Todos</option>
            {HOSTS_RASTREADOS.map((h) => (
              <option key={h.host} value={h.host}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-outline">
          Filtrar
        </button>
      </form>

      <div className="card grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted">Pageviews</p>
          <p className="text-lg font-semibold text-navy">
            {stats.totalPageviews.toLocaleString("pt-BR")}
          </p>
        </div>
        <div>
          <p className="text-muted">Sessões únicas</p>
          <p className="text-lg font-semibold text-navy">
            {stats.sessoesUnicas.toLocaleString("pt-BR")}
          </p>
        </div>
        <div>
          <p className="text-muted">Páginas únicas visitadas</p>
          <p className="text-lg font-semibold text-navy">
            {stats.paginasUnicas.toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-bold text-navy">Visitas por dia</h2>
        <div className="card p-5">
          <GraficoDiario porDia={stats.porDia} />
        </div>
      </div>

      {host === "todos" && stats.porHost.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-bold text-navy">Por site</h2>
          <div className="card space-y-3 p-5">
            {stats.porHost.map((h) => (
              <BarraEstatistica
                key={h.host}
                label={HOSTS_RASTREADOS.find((x) => x.host === h.host)?.label ?? h.host}
                total={h.total}
                max={maxHost}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-bold text-navy">Páginas mais visitadas</h2>
          {stats.topPaginas.length === 0 ? (
            <p className="empty-state">Nenhuma visita no período.</p>
          ) : (
            <div className="card space-y-3 p-5">
              {stats.topPaginas.map((p) => (
                <BarraEstatistica key={p.path} label={p.path} total={p.total} max={maxPagina} />
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-lg font-bold text-navy">De onde vêm</h2>
          {stats.topReferrers.length === 0 ? (
            <p className="empty-state">Nenhuma origem registrada no período.</p>
          ) : (
            <div className="card space-y-3 p-5">
              {stats.topReferrers.map((r) => (
                <BarraEstatistica key={r.origem} label={r.origem} total={r.total} max={maxReferrer} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-bold text-navy">Campanhas (UTM)</h2>
        {stats.topCampanhas.length === 0 ? (
          <p className="empty-state">Nenhuma visita com UTM registrada no período.</p>
        ) : (
          <div className="card space-y-3 p-5">
            {stats.topCampanhas.map((c) => (
              <BarraEstatistica key={c.utm} label={c.utm} total={c.total} max={maxCampanha} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
