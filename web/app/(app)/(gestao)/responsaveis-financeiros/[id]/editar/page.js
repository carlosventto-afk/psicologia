import Link from "next/link";
import { notFound } from "next/navigation";
import ResponsavelFinanceiroForm from "@/components/ResponsavelFinanceiroForm";
import { atualizarResponsavelFinanceiro } from "@/lib/actions/responsaveis-financeiros";
import { buscarResponsavelFinanceiro } from "@/lib/data/responsaveis-financeiros";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";

export default async function PaginaEditarResponsavelFinanceiro({ params }) {
  const { id } = await params;
  const responsavelId = Number(id);
  if (!Number.isInteger(responsavelId) || responsavelId <= 0) notFound();

  let responsavel;
  try {
    responsavel = await buscarResponsavelFinanceiro(responsavelId);
  } catch {
    notFound();
  }
  const pacientes = await listarPacientesParaSelect(null, responsavel.paciente_vinculado);

  return (
    <div className="space-y-4">
      <Link href="/responsaveis-financeiros" className="link text-sm">
        ← Responsáveis Financeiros
      </Link>
      <h1 className="page-title">Editar Responsável Financeiro</h1>
      <p className="text-sm text-muted">
        O CPF/CNPJ e os contatos daqui são usados como tomador da nota fiscal. Se este responsável também é um paciente,
        vincule-o abaixo: o que faltar no cadastro do responsável é completado pelo cadastro do paciente.
      </p>
      <ResponsavelFinanceiroForm
        action={atualizarResponsavelFinanceiro.bind(null, responsavelId)}
        pacientes={pacientes}
        valores={responsavel}
        rotuloSalvar="Salvar alterações"
      />
    </div>
  );
}
