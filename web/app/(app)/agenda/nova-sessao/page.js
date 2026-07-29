import SessaoForm from "@/components/SessaoForm";
import { criarSessao } from "@/lib/actions/sessoes";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarTiposAtendimento } from "@/lib/data/lookups";

export default async function PaginaNovaSessao({ searchParams }) {
  const { paciente } = await searchParams;
  const [pacientes, pacotes, tiposAtendimento] = await Promise.all([
    listarPacientesParaSelect(),
    listarPacotes(),
    listarTiposAtendimento(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Nova Sessão</h1>
      <SessaoForm
        action={criarSessao}
        pacientes={pacientes}
        pacotes={pacotes}
        tiposAtendimento={tiposAtendimento}
        pacienteInicialId={paciente ? Number(paciente) : undefined}
      />
    </div>
  );
}
