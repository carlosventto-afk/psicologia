import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarCobranca } from "@/lib/data/cobrancas";
import { listarContas } from "@/lib/data/contas";
import { formatarMoeda } from "@/lib/formatar-moeda";
import ReceberCobrancaForm from "@/components/ReceberCobrancaForm";
import CancelarCobrancaBotao from "@/components/CancelarCobrancaBotao";
import { hojeSaoPaulo } from "@/lib/cobranca";
import SituacaoCobrancaBadge, { ROTULOS_DOCUMENTO, dataBR } from "@/components/SituacaoCobrancaBadge";

export default async function PaginaCobranca({ params }) {
  const { id } = await params;
  const cobrancaId = Number(id);
  if (!Number.isInteger(cobrancaId) || cobrancaId <= 0) notFound();

  const cobranca = await buscarCobranca(cobrancaId);
  if (!cobranca) notFound();

  const aberta = cobranca.situacao === "aberta";
  const recebida = cobranca.situacao === "recebida";
  const rec = cobranca.recebimento;
  // Contas sao necessarias no form (aberta) e para exibir o nome (recebida).
  const contas = aberta || (recebida && rec) ? await listarContas() : [];
  const nomeConta = rec ? contas.find((c) => c.id === rec.conta)?.nome : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cobrancas" className="link text-sm">
            ← Cobranças
          </Link>
          <h1 className="page-title">Cobrança — {cobranca.paciente.nome}</h1>
        </div>
        <SituacaoCobrancaBadge situacao={cobranca.situacao} />
      </div>

      <div className="card space-y-1 p-4 text-sm">
        <p>
          <span className="font-semibold text-navy">Valor total:</span> {formatarMoeda(cobranca.valor_total)}
        </p>
        <p>
          <span className="font-semibold text-navy">Documento:</span>{" "}
          {ROTULOS_DOCUMENTO[cobranca.tipo_documento] ?? cobranca.tipo_documento}
        </p>
        {cobranca.ResponsavelFinanceiro && (
          <p>
            <span className="font-semibold text-navy">Responsável financeiro:</span>{" "}
            {cobranca.ResponsavelFinanceiro.nome}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Sessões incluídas</h2>
        {cobranca.sessoes.length === 0 ? (
          <p className="empty-state">Nenhuma sessão vinculada.</p>
        ) : (
          <div className="space-y-2">
            {cobranca.sessoes.map((s) => (
              <div key={s.id} className="card flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-navy">
                  {dataBR(s.data)}
                  {s.horario ? ` às ${String(s.horario).slice(0, 5)}` : ""}
                </span>
                <span className="font-semibold text-navy">{formatarMoeda(s.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {recebida && (
        <div className="card space-y-1 p-4 text-sm">
          <h2 className="text-lg font-bold text-navy mb-1">Pagamento</h2>
          {rec ? (
            <>
              <p>
                <span className="font-semibold text-navy">Data:</span> {dataBR(rec.data_recebimento)}
              </p>
              <p>
                <span className="font-semibold text-navy">Conta:</span> {nomeConta ?? "—"}
              </p>
              <p>
                <span className="font-semibold text-navy">Forma:</span> {rec.forma_pagamento}
              </p>
            </>
          ) : (
            <p className="text-muted">Recebida em {dataBR(cobranca.recebida_em)}.</p>
          )}
          {cobranca.tipo_documento === "recibo" && (
            <Link href="/recibos" className="link inline-block pt-1">
              Ver recibos
            </Link>
          )}
          {cobranca.tipo_documento === "nota_fiscal" && (
            <Link href="/notas-fiscais" className="link inline-block pt-1">
              Ver notas fiscais
            </Link>
          )}
        </div>
      )}

      {aberta && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Receber cobrança</h2>
          <ReceberCobrancaForm cobrancaId={cobranca.id} contas={contas} hoje={hojeSaoPaulo()} />
          <CancelarCobrancaBotao cobrancaId={cobranca.id} />
        </div>
      )}
    </div>
  );
}
