import Link from "next/link";
import { listarPagamentosElegiveis } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { calcularPeriodo, hojeISO, deslocarData, formatarRotuloPeriodo } from "@/lib/periodo-agenda";
import CarneLeaoForm from "@/components/CarneLeaoForm";

export default async function PaginaCarneLeao({ searchParams }) {
  const { data = hojeISO() } = await searchParams;
  const { inicio, fim } = calcularPeriodo("mes", data);

  const [usuario, { elegiveis, semCpf }] = await Promise.all([
    buscarUsuarioAtual(),
    listarPagamentosElegiveis({ dataInicio: inicio, dataFim: fim }),
  ]);

  const anterior = deslocarData(data, "mes", -1);
  const proximo = deslocarData(data, "mes", 1);
  const rotulo = formatarRotuloPeriodo("mes", data, inicio, fim);
  const [ano, mes] = inicio.split("-");

  const porPagador = Object.values(
    elegiveis.reduce((acc, item) => {
      const chave = item.cpfPagador;
      if (!acc[chave]) acc[chave] = { cpfPagador: chave, pagadorNome: item.pagadorNome, pagamentos: [] };
      acc[chave].pagamentos.push(item);
      return acc;
    }, {})
  );

  return (
    <div className="space-y-4">
      <h1 className="page-title">Carnê-Leão</h1>

      <div className="flex items-center gap-2">
        <Link href={`/carne-leao?data=${anterior}`} className="btn-outline px-3 py-1.5" aria-label="Mês anterior">
          ‹
        </Link>
        <Link href={`/carne-leao?data=${hojeISO()}`} className="btn-outline py-1.5">
          Hoje
        </Link>
        <Link href={`/carne-leao?data=${proximo}`} className="btn-outline px-3 py-1.5" aria-label="Próximo mês">
          ›
        </Link>
        <span className="text-sm font-bold text-navy ml-2">{rotulo}</span>
      </div>

      {!usuario.cpf && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          Cadastre seu CPF em{" "}
          <Link href="/configuracoes/conta" className="underline font-semibold">
            Meus Dados
          </Link>{" "}
          antes de gerar o arquivo — ele é obrigatório no layout do Carnê-Leão.
        </p>
      )}

      {semCpf.length > 0 && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          {semCpf.length} pagamento(s) não aparecem na lista abaixo por falta de CPF no cadastro do paciente ou
          responsável financeiro: {semCpf.map((p) => p.pacienteNome).join(", ")}.
        </p>
      )}

      {elegiveis.length === 0 ? (
        <p className="empty-state">Nenhum pagamento elegível para o Carnê-Leão neste mês.</p>
      ) : usuario.cpf ? (
        <CarneLeaoForm porPagador={porPagador} mes={mes} ano={ano} />
      ) : null}
    </div>
  );
}
