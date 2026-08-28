import Link from "next/link";
import { listarLancamentos } from "@/lib/data/lancamentos";
import { listarContas } from "@/lib/data/contas";
import { listarClassificacoes } from "@/lib/data/classificacoes";
import { excluirLancamento } from "@/lib/actions/lancamentos";
import ExcluirLancamentoBotao from "@/components/ExcluirLancamentoBotao";
import { formatarMoeda } from "@/lib/formatar-moeda";

export default async function PaginaLancamentos({ searchParams }) {
  const { conta = "", tipo = "", classificacao = "", inicio = "", fim = "" } = await searchParams;
  const [lancamentos, contas, classificacoes] = await Promise.all([
    listarLancamentos({
      contaId: conta ? Number(conta) : undefined,
      tipo: tipo || undefined,
      classificacaoId: classificacao ? Number(classificacao) : undefined,
      dataInicio: inicio || undefined,
      dataFim: fim || undefined,
    }),
    listarContas(),
    listarClassificacoes(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Lançamentos Financeiros</h1>
        <Link
          href="/financeiro/lancamentos/novo"
          className="btn-primary"
        >
          Novo Lançamento
        </Link>
      </div>

      <form className="flex flex-wrap gap-3 items-end card p-4">
        <div>
          <label className="block text-xs text-muted">Conta</label>
          <select name="conta" defaultValue={conta} className="field mt-0">
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">Tipo</label>
          <select name="tipo" defaultValue={tipo} className="field mt-0">
            <option value="">Todos</option>
            <option value="Receita">Receita</option>
            <option value="Despesa">Despesa</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">Classificação</label>
          <select name="classificacao" defaultValue={classificacao} className="field mt-0">
            <option value="">Todas</option>
            {classificacoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">De</label>
          <input type="date" name="inicio" defaultValue={inicio} className="field mt-0" />
        </div>
        <div>
          <label className="block text-xs text-muted">Até</label>
          <input type="date" name="fim" defaultValue={fim} className="field mt-0" />
        </div>
        <button type="submit" className="btn-dark">
          Filtrar
        </button>
      </form>

      {lancamentos.length === 0 ? (
        <p className="empty-state">Nenhum lançamento encontrado.</p>
      ) : (
        <div className="space-y-3">
          {lancamentos.map((l) => (
            <div
              key={l.id}
              className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{l.descricao}</p>
                <p className="text-muted">
                  {String(l.data).slice(0, 10)} · {l.conta_nome} · {l.classificacao_nome} · {l.tipo}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className={l.tipo === "Despesa" ? "text-red-600" : "text-green-700"}>
                  {formatarMoeda(l.valor)}
                </span>
                <Link href={`/financeiro/lancamentos/${l.id}/editar`} className="text-sm text-blue-600 hover:underline">
                  Editar
                </Link>
                <ExcluirLancamentoBotao action={excluirLancamento.bind(null, l.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
