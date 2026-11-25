import Link from "next/link";
import { listarCobrancas } from "@/lib/data/cobrancas";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";
import { formatarMoeda } from "@/lib/formatar-moeda";
import { mesFiltroValido } from "@/lib/cobranca";
import SituacaoCobrancaBadge, { ROTULOS_DOCUMENTO, dataBR } from "@/components/SituacaoCobrancaBadge";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function rotuloPeriodo(c) {
  if (c.periodo_referencia) {
    const [ano, mes] = String(c.periodo_referencia).split("-");
    return `${MESES[Number(mes) - 1]}/${ano}`;
  }
  if (!c.data_inicio) return "—";
  return c.data_inicio === c.data_fim ? dataBR(c.data_inicio) : `${dataBR(c.data_inicio)} a ${dataBR(c.data_fim)}`;
}

const SITUACOES = [
  { valor: "", rotulo: "Todas" },
  { valor: "aberta", rotulo: "Em aberto" },
  { valor: "recebida", rotulo: "Recebida" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

export default async function PaginaCobrancas({ searchParams }) {
  const { situacao = "", paciente = "", mes = "" } = await searchParams;
  const situacaoValida = SITUACOES.some((s) => s.valor && s.valor === situacao) ? situacao : "";
  const pacienteId = Number(paciente) || null;
  const mesValido = mesFiltroValido(mes);

  const [cobrancas, pacientes] = await Promise.all([
    listarCobrancas({ situacao: situacaoValida || undefined, pacienteId: pacienteId ?? undefined, periodo: mesValido ?? undefined }),
    listarPacientesParaSelect(null, pacienteId),
  ]);
  const filtrado = Boolean(situacaoValida || pacienteId || mesValido);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Cobranças</h1>
        <Link href="/cobrancas/nova" className="btn-primary">
          Nova cobrança
        </Link>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select name="situacao" defaultValue={situacaoValida} aria-label="Situação" className="field mt-0 sm:max-w-48">
          {SITUACOES.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <select name="paciente" defaultValue={pacienteId ?? ""} aria-label="Paciente" className="field mt-0 sm:max-w-64">
          <option value="">Todos os pacientes</option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <input
          type="month"
          name="mes"
          defaultValue={mesValido ?? ""}
          aria-label="Mês"
          className="field mt-0 sm:max-w-44"
        />
        <button type="submit" className="btn-outline">
          Filtrar
        </button>
        {filtrado && (
          <Link href="/cobrancas" className="link text-sm">
            Limpar filtros
          </Link>
        )}
      </form>

      {cobrancas.length === 0 ? (
        <p className="empty-state">
          {filtrado
            ? "Nenhuma cobrança encontrada com esses filtros."
            : "Nenhuma cobrança ainda. Uma cobrança agrupa sessões realizadas de um paciente para você receber de uma vez e, se quiser, emitir recibo ou nota fiscal. Clique em \"Nova cobrança\" para começar."}
        </p>
      ) : (
        <div className="space-y-3">
          {cobrancas.map((c) => (
            <div
              key={c.id}
              className="card flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-5 sm:items-center">
                <Link href={`/cobrancas/${c.id}`} className="truncate font-semibold text-navy sm:col-span-2">
                  {c.nomes_pacientes.length > 0 ? c.nomes_pacientes.join(" + ") : "Paciente"}
                </Link>
                <p className="text-muted">{rotuloPeriodo(c)}</p>
                <p className="font-semibold text-navy">{formatarMoeda(c.valor_total)}</p>
                <p className="text-muted">{ROTULOS_DOCUMENTO[c.tipo_documento] ?? c.tipo_documento}</p>
              </div>
              <div className="flex items-center gap-3">
                <SituacaoCobrancaBadge situacao={c.situacao} />
                {c.situacao === "aberta" && (
                  <Link href={`/cobrancas/${c.id}`} className="btn-primary">
                    Receber
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
