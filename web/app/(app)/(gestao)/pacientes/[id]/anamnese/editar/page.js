import { buscarPaciente } from "@/lib/data/pacientes";
import { buscarAnamnese } from "@/lib/data/anamnese";
import { salvarAnamnese } from "@/lib/actions/anamnese";
import AnamneseForm from "@/components/AnamneseForm";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

export default async function PaginaEditarAnamnese({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, anamnese] = await Promise.all([
    buscarPaciente(pacienteId),
    buscarAnamnese(pacienteId),
  ]);
  const acaoComId = salvarAnamnese.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Anamnese — {formatarNomePaciente(paciente.nome, paciente.apelido)}</h1>
      <AnamneseForm action={acaoComId} anamnese={anamnese} />
    </div>
  );
}
