import PacienteForm from "@/components/PacienteForm";
import { criarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaNovoPaciente() {
  const [pacotes, consultorios] = await Promise.all([listarPacotes(), listarConsultorios()]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Paciente</h1>
      <PacienteForm action={criarPaciente} pacotes={pacotes} consultorios={consultorios} />
    </div>
  );
}
