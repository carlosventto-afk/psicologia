import Link from "next/link";
import { listarLancamentos } from "@/lib/data/lancamentos";
import { listarContas } from "@/lib/data/contas";
import { excluirLancamento } from "@/lib/actions/lancamentos";
import ExcluirLancamentoBotao from "@/components/ExcluirLancamentoBotao";

export default async function PaginaLancamentos({ searchParams }) {
  const { conta = "", tipo = "", inicio = "", fim = "" } = await searchParams;
  const [lancamentos, contas] = await Promise.all([
    listarLancamentos({
      contaId: conta ? Number(conta) : undefined,
      tipo: tipo || undefined,
      dataInicio: inicio || undefined,
      dataFim: fim || undefined,
    }),
    listarContas(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
            <div key={l.id} className="card flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-navy">{l.descricao}</p>
                <p className="text-muted">
                  {String(l.data).slice(0, 10)} · {l.conta_nome} · {l.tipo}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className={l.tipo === "Despesa" ? "text-red-600" : "text-green-700"}>
                  R$ {l.valor}
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
