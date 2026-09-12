import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { buscarLead } from "@/lib/data/crm";
import { adicionarNotaLead } from "@/lib/actions/crm";
import SeletorEstagioLead from "@/components/SeletorEstagioLead";
import LeadNotaForm from "@/components/LeadNotaForm";
import BotaoRetomarAgente from "@/components/BotaoRetomarAgente";

const ROTULOS_ORIGEM = {
  cadastro: "Veio de cadastro",
  manual: "Lead manual",
  whatsapp: "Veio do WhatsApp",
};

const ROTULOS_AUTOR = {
  admin: "Você",
  lead: "Lead",
  agente: "Agente",
};

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
          <div className="flex items-center gap-2">
            <h1 className="page-title">{lead.nome || lead.telefone}</h1>
            {lead.aguardando_humano && (
              <span className="rounded-full bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5">
                Aguardando você
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {lead.telefone}
            {lead.email && ` · ${lead.email}`} · {ROTULOS_ORIGEM[lead.origem] ?? lead.origem} ·{" "}
            {new Date(lead.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lead.aguardando_humano && <BotaoRetomarAgente id={lead.id} />}
          <SeletorEstagioLead id={lead.id} estagioAtual={lead.estagio} />
        </div>
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
                {ROTULOS_AUTOR[nota.autor] ?? nota.autor} ·{" "}
                {new Date(nota.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
