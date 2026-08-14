import LancamentoForm from "@/components/LancamentoForm";
import { listarContas } from "@/lib/data/contas";
import { buscarLancamento } from "@/lib/data/lancamentos";
import { atualizarLancamento } from "@/lib/actions/lancamentos";

export default async function PaginaEditarLancamento({ params }) {
  const { id } = await params;
  const lancamentoId = Number(id);
  const [lancamento, contas] = await Promise.all([
    buscarLancamento(lancamentoId),
    listarContas(),
  ]);
  const acaoComId = atualizarLancamento.bind(null, lancamentoId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Lançamento</h1>
      <LancamentoForm action={acaoComId} contas={contas} valoresIniciais={lancamento} />
    </div>
  );
}
