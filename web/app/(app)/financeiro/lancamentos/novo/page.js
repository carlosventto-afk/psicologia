import LancamentoForm from "@/components/LancamentoForm";
import { listarContas } from "@/lib/data/contas";

export default async function PaginaNovoLancamento() {
  const contas = await listarContas();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Lançamento</h1>
      <LancamentoForm contas={contas} />
    </div>
  );
}
