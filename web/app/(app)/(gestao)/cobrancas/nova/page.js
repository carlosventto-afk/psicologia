import Link from "next/link";
import { intervaloDoMes, mesDoParametro, valorMes, rotuloMes } from "@/lib/cobranca";
import { listarPacientesComPendencias } from "@/lib/data/cobrancas";
import { criarCobrancasDoMes } from "@/lib/actions/cobrancas";
import NovaCobrancaMesForm from "@/components/NovaCobrancaMesForm";

export default async function PaginaNovaCobranca({ searchParams }) {
  const { mes: mesParam } = await searchParams;
  const mes = mesDoParametro(mesParam);
  const { inicio, fim } = intervaloDoMes(mes.ano, mes.mes);
  const pacientes = await listarPacientesComPendencias({ inicio, fim });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Nova cobrança</h1>
        <Link href="/cobrancas" className="link text-sm">
          Voltar às cobranças
        </Link>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="mes" className="text-sm font-semibold text-navy">
          Mês de referência
        </label>
        <input id="mes" name="mes" type="month" defaultValue={valorMes(mes)} required className="field mt-0 sm:max-w-48" />
        <button type="submit" className="btn-outline">
          Carregar
        </button>
      </form>

      <NovaCobrancaMesForm
        key={valorMes(mes)}
        action={criarCobrancasDoMes}
        periodo={inicio}
        pacientes={pacientes}
        rotuloMes={rotuloMes(mes)}
      />
    </div>
  );
}
