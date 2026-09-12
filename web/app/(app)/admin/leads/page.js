import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { listarLeads } from "@/lib/data/crm";
import LeadManualForm from "@/components/LeadManualForm";
import SeletorEstagioLead from "@/components/SeletorEstagioLead";

const ROTULOS_ESTAGIO = {
  novo: "Novo",
  em_contato: "Em contato",
  qualificado: "Qualificado",
  proposta_enviada: "Proposta enviada",
  fechado_ganho: "Fechado (ganho)",
  perdido: "Perdido",
};

export default async function PaginaCrmLeads({ searchParams }) {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const { estagio = "" } = await searchParams;
  const leads = await listarLeads({ estagio: estagio || undefined });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">CRM — Leads</h1>
        <p className="text-sm text-muted">{leads.length} lead(s)</p>
      </div>

      <LeadManualForm />

      <form className="flex items-end gap-2 sm:max-w-xs">
        <select name="estagio" defaultValue={estagio} className="field mt-0">
          <option value="">Todos os estágios</option>
          {Object.entries(ROTULOS_ESTAGIO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-outline">
          Filtrar
        </button>
      </form>

      {leads.length === 0 ? (
        <p className="empty-state">Nenhum lead encontrado.</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link href={`/admin/leads/${lead.id}`} className="font-semibold text-navy hover:underline">
                  {lead.nome}
                </Link>
                <p className="text-sm text-muted">
                  {lead.telefone} · {lead.origem === "cadastro" ? "Cadastro" : "Manual"} ·{" "}
                  {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <SeletorEstagioLead id={lead.id} estagioAtual={lead.estagio} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
