import RegistroAtendimentoForm from "@/components/RegistroAtendimentoForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { marcarAtendimentoRealizado } from "@/lib/actions/sessoes";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaRegistrarAtendimento({ params, searchParams }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const { voltarPara } = await searchParams;
  const sessao = await buscarSessao(sessaoId);
  const [contas, responsaveis] = await Promise.all([
    listarContas(),
    listarResponsaveisDoPaciente(sessao.paciente_id),
  ]);
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
      <RegistroAtendimentoForm
        action={acaoComId}
        contas={contas}
        responsaveis={responsaveis}
        valor={sessao.valor}
        dataInicial={hojeISO()}
        voltarPara={voltarPara}
      />
    </div>
  );
}
