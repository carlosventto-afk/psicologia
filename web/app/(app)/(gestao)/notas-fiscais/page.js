import { listarPagamentosElegiveisParaNotaFiscal, listarNotasFiscaisEmitidas } from "@/lib/data/notas-fiscais";
import EmitirNotaFiscalBotao from "@/components/EmitirNotaFiscalBotao";
import CancelarNotaFiscalBotao from "@/components/CancelarNotaFiscalBotao";
import { formatarMoeda } from "@/lib/formatar-moeda";
import VerificarNotaSefinBotao from "@/components/VerificarNotaSefinBotao";
import { notaVerificavelNaSefin } from "@/lib/nota-fiscal";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";
import AvisoRecursoPago from "@/components/AvisoRecursoPago";
import BaixarNotasEmBloco from "@/components/BaixarNotasEmBloco";
import { notaTemDocumento, filtrarPorCompetencia, DATA_ISO, LIMITE_NOTAS_EM_BLOCO } from "@/lib/nfse-documentos";

const comDocumento = (n) => notaTemDocumento({ status: n.status, chave_acesso: n.chaveAcesso });

const dataBR = (iso) => iso.split("-").reverse().join("/");

export default async function PaginaNotasFiscais({ searchParams }) {
  const filtros = await searchParams;
  const de = DATA_ISO.test(filtros?.de ?? "") ? filtros.de : "";
  const ate = DATA_ISO.test(filtros?.ate ?? "") ? filtros.ate : "";
  const usuario = await buscarUsuarioAtual();
  if (!PLANOS[usuario.plano].temDocumentos) {
    return <AvisoRecursoPago recurso="A emissão de notas fiscais" />;
  }

  const [elegiveis, todasEmitidas] = await Promise.all([
    listarPagamentosElegiveisParaNotaFiscal(),
    listarNotasFiscaisEmitidas(),
  ]);
  const emitidas = filtrarPorCompetencia(todasEmitidas, de, ate);
  const filtrando = Boolean(de || ate);
  const baixaveis = emitidas.filter(comDocumento).length;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Notas Fiscais</h1>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Pagamentos elegíveis</h2>
        {elegiveis.length === 0 ? (
          <p className="empty-state">
            Nenhum pagamento disponível para emissão. Só aparecem aqui pagamentos de pacientes com &quot;Documento&quot;
            marcado como Nota Fiscal no cadastro.
          </p>
        ) : (
          <div className="space-y-3">
            {elegiveis.map((p) => (
              <div
                key={p.pagamentoId}
                className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{p.pacienteNome}</p>
                  <p className="text-muted">
                    {p.dataSessao} — {formatarMoeda(p.valor)}
                  </p>
                </div>
                <EmitirNotaFiscalBotao pagamentoId={p.pagamentoId} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy mb-2">Notas emitidas</h2>
        <form method="get" className="card mb-3 flex flex-wrap items-end gap-3 px-4 py-3 text-sm">
          <label className="flex flex-col gap-1 text-navy">
            Competência de
            <input type="date" name="de" defaultValue={de} className="field mt-0" />
          </label>
          <label className="flex flex-col gap-1 text-navy">
            até
            <input type="date" name="ate" defaultValue={ate} className="field mt-0" />
          </label>
          <button type="submit" className="btn-dark">
            Filtrar
          </button>
          {filtrando && (
            <a href="/notas-fiscais" className="link">
              Limpar filtro
            </a>
          )}
        </form>
        {baixaveis > LIMITE_NOTAS_EM_BLOCO && (
          <p className="mb-3 text-sm text-yellow-700">
            Há {baixaveis} notas neste filtro; o download em bloco aceita até {LIMITE_NOTAS_EM_BLOCO} por vez. Use um período menor.
          </p>
        )}
        {emitidas.length === 0 ? (
          <p className="empty-state">{filtrando ? "Nenhuma nota nesse período de competência." : "Nenhuma nota emitida ainda."}</p>
        ) : (
          <div className="space-y-3">
            {emitidas.some(comDocumento) && <BaixarNotasEmBloco />}
            {emitidas.map((n) => (
              <div
                key={n.id}
                className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                {comDocumento(n) && (
                  <input
                    type="checkbox"
                    name="id"
                    value={n.id}
                    form="form-download-notas"
                    aria-label={`Selecionar nota ${n.numero}/${n.serie}`}
                    className="shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">
                    {n.pacienteNome} — Nº {n.numero}/{n.serie}
                    {n.valor != null && ` — ${formatarMoeda(n.valor)}`}
                  </p>
                  {n.competencia && <p className="text-xs text-muted">Competência: {dataBR(n.competencia)}</p>}
                  <p className="text-muted">
                    {n.status === "autorizada" && `Autorizada (${n.ambiente})`}
                    {n.status === "rejeitada" && `Rejeitada: ${n.erros?.[0]?.titulo ?? n.ultimoErro ?? "erro"}`}
                    {n.status === "cancelada" && "Cancelada"}
                    {n.status === "pendente" &&
                      (n.daCobranca
                        ? "Pendente — aguardando confirmação da prefeitura; não emita de novo, confira no portal da NFS-e"
                        : "Pendente")}
                  </p>
                  {n.status === "autorizada" && n.chaveAcesso && (
                    <p className="text-xs text-muted">Chave de acesso: {n.chaveAcesso}</p>
                  )}
                </div>
                {comDocumento(n) && (
                  <div className="flex shrink-0 gap-3">
                    <a href={`/api/notas-fiscais/download?id=${n.id}&formato=pdf`} className="link">
                      PDF
                    </a>
                    <a href={`/api/notas-fiscais/download?id=${n.id}&formato=xml`} className="link">
                      XML
                    </a>
                  </div>
                )}
                {n.status === "autorizada" && <CancelarNotaFiscalBotao notaId={n.id} />}
                {notaVerificavelNaSefin({ status: n.status, ultimo_erro: n.ultimoErro, created_at: n.criadoEm }) && (
                  <VerificarNotaSefinBotao notaId={n.id} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
