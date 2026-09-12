import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { buscarLead } from "@/lib/data/crm";
import { adicionarNotaLead } from "@/lib/actions/crm";
import SeletorEstagioLead from "@/components/SeletorEstagioLead";
import LeadNotaForm from "@/components/LeadNotaForm";

export default async function PaginaDetalheLead({ params }) {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const { id } = await params;
  let lead;
  try {
    lead = await buscarLead(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/leads" className="text-sm font-semibold text-navy">
        ‹ Voltar pro CRM
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{lead.nome}</h1>
          <p className="text-sm text-muted">
            {lead.telefone}
            {lead.email && ` · ${lead.email}`} ·{" "}
            {lead.origem === "cadastro" ? "Veio de cadastro" : "Lead manual"} ·{" "}
            {new Date(lead.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <SeletorEstagioLead id={lead.id} estagioAtual={lead.estagio} />
      </div>

      <LeadNotaForm action={adicionarNotaLead.bind(null, lead.id)} />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Histórico</h2>
        {lead.notas.length === 0 ? (
          <p className="empty-state">Nenhuma nota ainda.</p>
        ) : (
          lead.notas.map((nota) => (
            <div key={nota.id} className="card p-4">
              <p className="whitespace-pre-wrap text-navy">{nota.texto}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(nota.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
