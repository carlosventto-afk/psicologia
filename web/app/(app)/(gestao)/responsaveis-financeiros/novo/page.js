import ResponsavelFinanceiroForm from "@/components/ResponsavelFinanceiroForm";
import { criarResponsavelFinanceiro } from "@/lib/actions/responsaveis-financeiros";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";

export default async function PaginaNovoResponsavelFinanceiro() {
  const pacientes = await listarPacientesParaSelect();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Responsável Financeiro</h1>
      <ResponsavelFinanceiroForm action={criarResponsavelFinanceiro} pacientes={pacientes} />
    </div>
  );
}
