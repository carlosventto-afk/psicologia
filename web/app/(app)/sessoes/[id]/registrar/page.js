import RegistroAtendimentoForm from "@/components/RegistroAtendimentoForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { marcarAtendimentoRealizado } from "@/lib/actions/sessoes";

export default async function PaginaRegistrarAtendimento({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const sessao = await buscarSessao(sessaoId);
  const acaoComId = marcarAtendimentoRealizado.bind(null, sessaoId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Registrar Atendimento</h1>
      <div className="text-sm text-muted">
        <p className="font-semibold text-navy">{sessao.paciente_nome}</p>
        <p>
          {sessao.data} {sessao.horario}
        </p>
      </div>
      <RegistroAtendimentoForm action={acaoComId} />
    </div>
  );
}
