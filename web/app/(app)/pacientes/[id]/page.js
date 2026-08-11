import Link from "next/link";
import { buscarPaciente, listarSessoesDoPaciente } from "@/lib/data/pacientes";
import { diaDaSemanaAbreviado } from "@/lib/periodo-agenda";

export default async function PaginaDetalhePaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, sessoes] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesDoPaciente(pacienteId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{paciente.nome}</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/agenda/nova-sessao?paciente=${pacienteId}`} className="link">
            Nova Sessão
          </Link>
          <Link href="/recibos" className="link">
            Gerar Recibo
          </Link>
          <Link href={`/pacientes/${pacienteId}/editar`} className="link">
            Editar
          </Link>
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted">Telefone</p>
          <p>{paciente.telefone || "—"}</p>
        </div>
        <div>
          <p className="text-muted">E-mail</p>
          <p>{paciente.email || "—"}</p>
        </div>
        <div>
          <p className="text-muted">Data de nascimento</p>
          <p>{paciente.data_nascimento || "—"}</p>
        </div>
        <div>
          <p className="text-muted">Valor da sessão</p>
          <p>R$ {paciente.valor_sessao}</p>
        </div>
        <div>
          <p className="text-muted">CPF</p>
          <p>{paciente.cpf || "—"}</p>
        </div>
        <div>
          <p className="text-muted">RG</p>
          <p>
            {paciente.rg_numero || "—"}
            {paciente.rg_orgao_emissor && ` · ${paciente.rg_orgao_emissor}`}
            {paciente.rg_data_expedicao && ` · exp. ${paciente.rg_data_expedicao}`}
          </p>
        </div>
        {paciente.dependente && (
          <div className="col-span-2">
            <p className="text-muted">Responsável financeiro</p>
            <p>{paciente.responsavel_nome || "—"}</p>
          </div>
        )}
        {paciente.observacoes && (
          <div className="col-span-2">
            <p className="text-muted">Observações</p>
            <p>{paciente.observacoes}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Sessões</h2>
        {sessoes.length === 0 ? (
          <p className="empty-state">Nenhuma sessão registrada.</p>
        ) : (
          <div className="space-y-3">
            {sessoes.map((s) => (
              <div key={s.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {s.data} ({diaDaSemanaAbreviado(s.data)}) {s.horario?.slice(0, 5)}
                </span>
                <span className="text-muted">{s.tipo_sessao}</span>
                <span>{s.status ?? "Marcada"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
