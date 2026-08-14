import RegistroAtendimentoForm from "@/components/RegistroAtendimentoForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { marcarAtendimentoRealizado } from "@/lib/actions/sessoes";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaRegistrarAtendimento({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const [sessao, contas] = await Promise.all([buscarSessao(sessaoId), listarContas()]);
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
        valorInicial={sessao.valor_sessao}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
