import PagamentoSessaoForm from "@/components/PagamentoSessaoForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { registrarPagamentoSessao } from "@/lib/actions/pagamentos";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaPagamentoSessao({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const [sessao, contas] = await Promise.all([buscarSessao(sessaoId), listarContas()]);
  const acaoComId = registrarPagamentoSessao.bind(null, sessaoId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Registrar Pagamento</h1>
      <div className="text-sm text-muted">
        <p className="font-semibold text-navy">{sessao.paciente_nome}</p>
        <p>
          Sessão de {sessao.data} {sessao.horario}
        </p>
      </div>
      <PagamentoSessaoForm
        action={acaoComId}
        valorInicial={sessao.valor_sessao}
        contas={contas}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
