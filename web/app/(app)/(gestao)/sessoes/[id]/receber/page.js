import RecebimentoIndividualForm from "@/components/RecebimentoIndividualForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { registrarRecebimentoIndividual } from "@/lib/actions/recebimentos";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaReceberSessao({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const sessao = await buscarSessao(sessaoId);
  const [contas, responsaveis] = await Promise.all([
    listarContas(),
    listarResponsaveisDoPaciente(sessao.paciente_id),
  ]);
  const acaoComIds = registrarRecebimentoIndividual.bind(null, sessaoId, sessao.paciente_id);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Receber</h1>
      <div className="text-sm text-muted">
        <p className="font-semibold text-navy">{sessao.paciente_nome}</p>
        <p>
          Sessão de {sessao.data} {sessao.horario}
        </p>
      </div>
      <RecebimentoIndividualForm
        action={acaoComIds}
        valor={sessao.valor}
        contas={contas}
        responsaveis={responsaveis}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
