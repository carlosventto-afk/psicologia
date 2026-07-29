import Link from "next/link";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaConsultorios() {
  const consultorios = await listarConsultorios();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Meus Consultórios</h1>
        <Link href="/consultorios/novo" className="btn-primary">
          Novo Consultório
        </Link>
      </div>

      {consultorios.length === 0 ? (
        <p className="empty-state">Nenhum consultório cadastrado.</p>
      ) : (
        <div className="card divide-y">
          {consultorios.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-navy">{c.nome}</p>
                <p className="text-sm text-muted">
                  {c.telefone} {c.email_atendimento && `· ${c.email_atendimento}`}
                </p>
              </div>
              <Link href={`/consultorios/${c.id}/editar`} className="text-sm link">
                Editar
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
