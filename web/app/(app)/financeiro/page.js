import Link from "next/link";
import { resumoDoMes, listarInadimplentes, calcularPrevisto } from "@/lib/data/financeiro";
import { calcularPeriodo, hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaFinanceiro() {
  const hoje = hojeISO();
  const mesReferencia = hoje.slice(0, 7);
  const { inicio, fim } = calcularPeriodo("mes", hoje);

  const [resumo, inadimplentes, previsto] = await Promise.all([
    resumoDoMes(mesReferencia),
    listarInadimplentes(),
    calcularPrevisto({ dataInicio: inicio, dataFim: fim }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Financeiro</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/financeiro/contas" className="link">
            Contas
          </Link>
          <Link href="/financeiro/lancamentos" className="link">
            Ver pagamentos
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Resumo do mês</h2>
        <div className="card p-5 grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted">Previsto (mês)</p>
            <p className="text-lg font-semibold">R$ {previsto.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted">Receita</p>
            <p className="text-lg font-semibold text-green-700">R$ {resumo.total_receita}</p>
          </div>
          <div>
            <p className="text-muted">Despesa</p>
            <p className="text-lg font-semibold text-red-600">R$ {resumo.total_despesa}</p>
          </div>
          <div>
            <p className="text-muted">Saldo</p>
            <p className="text-lg font-semibold">R$ {resumo.saldo_mes}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Inadimplentes</h2>
        {inadimplentes.length === 0 ? (
          <p className="empty-state">Nenhum paciente inadimplente.</p>
        ) : (
          <div className="space-y-3">
            {inadimplentes.map((i) => (
              <div key={i.sessao_id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/pacientes/${i.paciente_id}`} className="font-semibold text-navy">
                  {i.paciente_nome}
                  {i.paciente_dependente && i.responsavel_nome && (
                    <span className="text-muted font-normal"> (dependente de {i.responsavel_nome})</span>
                  )}
                </Link>
                <span className="text-muted">{i.data}</span>
                <span className="text-red-600">R$ {i.valor_devido}</span>
                <Link href={`/sessoes/${i.sessao_id}/pagamento`} className="link">
                  Registrar Pagamento
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
