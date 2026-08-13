import PacienteForm from "@/components/PacienteForm";
import { criarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";

export default async function PaginaNovoPaciente() {
  const [pacotes, consultorios, pacientes] = await Promise.all([
    listarPacotes(),
    listarConsultorios(),
    listarPacientesParaSelect(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Paciente</h1>
      <PacienteForm action={criarPaciente} pacotes={pacotes} consultorios={consultorios} pacientes={pacientes} />
    </div>
  );
}
