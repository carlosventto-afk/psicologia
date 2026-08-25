import { redirect } from "next/navigation";
import { buscarPaciente } from "@/lib/data/pacientes";
import { buscarPropostaAtiva } from "@/lib/data/completar-cadastro";
import { aceitarPropostaCompletarCadastro, rejeitarPropostaCompletarCadastro } from "@/lib/actions/completar-cadastro";
import PropostaCadastroForm from "@/components/PropostaCadastroForm";

export default async function PaginaPropostaCadastro({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, proposta] = await Promise.all([
    buscarPaciente(pacienteId),
    buscarPropostaAtiva(pacienteId),
  ]);

  if (!proposta) {
    redirect(`/pacientes/${pacienteId}`);
  }

  const acaoAceitar = aceitarPropostaCompletarCadastro.bind(null, proposta.id, pacienteId);
  const acaoRejeitar = rejeitarPropostaCompletarCadastro.bind(null, proposta.id, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Proposta de atualização — {paciente.nome}</h1>
      <PropostaCadastroForm
        paciente={paciente}
        proposta={proposta}
        acaoAceitar={acaoAceitar}
        acaoRejeitar={acaoRejeitar}
      />
    </div>
  );
}
