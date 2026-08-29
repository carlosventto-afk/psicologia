import RecebimentoLoteForm from "@/components/RecebimentoLoteForm";
import { buscarPaciente } from "@/lib/data/pacientes";
import { listarSessoesReceptiveis } from "@/lib/data/recebimentos";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { registrarRecebimentoLote } from "@/lib/actions/recebimentos";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaReceberSessoesPaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, sessoes, contas, responsaveis] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesReceptiveis(pacienteId),
    listarContas(),
    listarResponsaveisDoPaciente(pacienteId),
  ]);
  const acaoComId = registrarRecebimentoLote.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Receber sessões — {paciente.nome}</h1>
      <RecebimentoLoteForm
        action={acaoComId}
        sessoes={sessoes}
        contas={contas}
        responsaveis={responsaveis}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
