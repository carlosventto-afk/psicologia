import PacienteForm from "@/components/PacienteForm";
import { buscarPaciente, listarPacientesParaSelect } from "@/lib/data/pacientes";
import { atualizarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaEditarPaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const paciente = await buscarPaciente(pacienteId);
  const [pacotes, consultorios, pacientes] = await Promise.all([
    listarPacotes(),
    listarConsultorios(),
    listarPacientesParaSelect(pacienteId, paciente.responsavel_financeiro),
  ]);
  const acaoComId = atualizarPaciente.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Paciente</h1>
      <PacienteForm
        action={acaoComId}
        paciente={paciente}
        pacotes={pacotes}
        consultorios={consultorios}
        pacientes={pacientes}
      />
    </div>
  );
}
