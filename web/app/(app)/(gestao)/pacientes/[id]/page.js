import Link from "next/link";
import { buscarPaciente, listarSessoesDoPaciente } from "@/lib/data/pacientes";
import { buscarAnamnese, listarFollowupsAnamnese } from "@/lib/data/anamnese";
import { buscarPropostaAtiva } from "@/lib/data/completar-cadastro";
import { CAMPOS_ANAMNESE } from "@/lib/anamnese-campos";
import { diaDaSemanaAbreviado } from "@/lib/periodo-agenda";
import { desativarPaciente, reativarPaciente } from "@/lib/actions/pacientes";
import ExcluirPacienteBotao from "@/components/ExcluirPacienteBotao";
import GerarLinkCadastroBotao from "@/components/GerarLinkCadastroBotao";
import { formatarMoeda } from "@/lib/formatar-moeda";
import { calcularCreditoDisponivel } from "@/lib/data/recebimentos";
import { usarCreditoNaSessao, excluirRecebimento } from "@/lib/actions/recebimentos";
import UsarCreditoBotao from "@/components/UsarCreditoBotao";
import DesfazerRecebimentoBotao from "@/components/DesfazerRecebimentoBotao";
import { listarResponsaveisDoPaciente, listarResponsaveisParaVincular } from "@/lib/data/responsaveis-financeiros";
import { vincularResponsavelExistente, criarEVincularResponsavel, desvincularResponsavel } from "@/lib/actions/responsaveis-financeiros";
import ResponsaveisFinanceirosPaciente from "@/components/ResponsaveisFinanceirosPaciente";
import { listarSessoesElegiveis, listarCobrancas } from "@/lib/data/cobrancas";
import { listarContas } from "@/lib/data/contas";
import { sessaoRealizada, saldoSessao, tipoDocumentoDoPaciente, hojeSaoPaulo } from "@/lib/cobranca";
import AgruparSessoesForm from "@/components/AgruparSessoesForm";
import ReceberCobrancaToggle from "@/components/ReceberCobrancaToggle";
import SituacaoCobrancaBadge, { ROTULOS_DOCUMENTO, dataBR } from "@/components/SituacaoCobrancaBadge";

const ABAS = [
  { chave: "dados", rotulo: "Dados" },
  { chave: "anamnese", rotulo: "Anamnese" },
  { chave: "sessoes", rotulo: "Sessões" },
  { chave: "cobrancas", rotulo: "Cobranças" },
];

function rotuloCampo(chave) {
  return CAMPOS_ANAMNESE.find((c) => c.chave === chave)?.rotulo ?? chave;
}

export default async function PaginaDetalhePaciente({ params, searchParams }) {
  const { id } = await params;
  const { aba: abaParam } = await searchParams;
  const aba = ABAS.some((a) => a.chave === abaParam) ? abaParam : "dados";
  const pacienteId = Number(id);
  const [paciente, sessoes, anamnese, followups, propostaAtiva, credito, responsaveis, paraVincular] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesDoPaciente(pacienteId),
    buscarAnamnese(pacienteId),
    listarFollowupsAnamnese(pacienteId),
    buscarPropostaAtiva(pacienteId),
    calcularCreditoDisponivel(pacienteId),
    listarResponsaveisDoPaciente(pacienteId),
    listarResponsaveisParaVincular(pacienteId),
  ]);
  const [elegiveis, cobrancas, contas] =
    aba === "cobrancas"
      ? await Promise.all([listarSessoesElegiveis(pacienteId), listarCobrancas({ pacienteId }), listarContas()])
      : [[], [], []];
  const sessoesParaAgrupar = elegiveis.map((s) => ({
    id: s.id,
    data: s.data,
    horario: s.horario,
    status: s.status ?? "Marcada",
    realizada: sessaoRealizada(s),
    saldo: saldoSessao(s),
  }));
  const vincularAcaoComId = vincularResponsavelExistente.bind(null, pacienteId);
  const criarEVincularAcaoComId = criarEVincularResponsavel.bind(null, pacienteId);
  const desvincularAcaoComId = desvincularResponsavel.bind(null, pacienteId);
  const excluirRecebimentoAcaoComId = excluirRecebimento.bind(null, pacienteId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title min-w-0 truncate">
          {paciente.nome}
          {paciente.apelido && <span className="text-muted font-normal"> ({paciente.apelido})</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link
            href={`/agenda/nova-sessao?paciente=${pacienteId}&voltarPara=${encodeURIComponent(`/pacientes/${pacienteId}`)}`}
            className="link"
          >
            Nova Sessão
          </Link>
          <Link href={`/pacientes/${pacienteId}/receber`} className="link">
            Receber Sessões
          </Link>
          <Link href="/recibos" className="link">
            Gerar Recibo
          </Link>
          <Link href={`/pacientes/${pacienteId}/editar`} className="link">
            Editar
          </Link>
          {paciente.ativo ? (
            <>
              <form action={desativarPaciente.bind(null, pacienteId)}>
                <button type="submit" className="link">
                  Desativar
                </button>
              </form>
              <ExcluirPacienteBotao pacienteId={pacienteId} />
            </>
          ) : (
            <form action={reativarPaciente.bind(null, pacienteId)}>
              <button type="submit" className="link">
                Reativar
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b border-border text-sm">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`/pacientes/${pacienteId}?aba=${a.chave}`}
            className={`pb-2 -mb-px border-b-2 font-semibold ${
              aba === a.chave ? "border-primary text-navy" : "border-transparent text-muted"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === "dados" && (
        <div className="space-y-4">
          <div className="card p-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted">Telefone</p>
              <p>{paciente.telefone || "—"}</p>
            </div>
            <div>
              <p className="text-muted">E-mail</p>
              <p>{paciente.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted">Data de nascimento</p>
              <p>{paciente.data_nascimento || "—"}</p>
            </div>
            <div>
              <p className="text-muted">Valor da sessão</p>
              <p>{formatarMoeda(paciente.valor_sessao)}</p>
            </div>
            <div>
              <p className="text-muted">CPF</p>
              <p>{paciente.cpf || "—"}</p>
            </div>
            <div>
              <p className="text-muted">RG</p>
              <p>
                {paciente.rg_numero || "—"}
                {paciente.rg_orgao_emissor && ` · ${paciente.rg_orgao_emissor}`}
                {paciente.rg_data_expedicao && ` · exp. ${paciente.rg_data_expedicao}`}
              </p>
            </div>
            {paciente.dependente && (
              <div className="col-span-2">
                <p className="text-muted">Responsável financeiro</p>
                <p>{paciente.responsavel_nome || "—"}</p>
              </div>
            )}
            {paciente.observacoes && (
              <div className="col-span-2">
                <p className="text-muted">Observações</p>
                <p>{paciente.observacoes}</p>
              </div>
            )}
          </div>

          {propostaAtiva && (
            <div className="card border border-yellow-200 bg-yellow-50 p-4 text-sm">
              <p className="text-navy">
                {propostaAtiva.status === "rejeitada"
                  ? "Uma proposta de atualização foi rejeitada, mas ainda pode ser aceita."
                  : "Tem uma atualização de cadastro esperando revisão."}
              </p>
              <Link href={`/pacientes/${pacienteId}/proposta-cadastro`} className="link">
                Revisar proposta
              </Link>
            </div>
          )}

          <GerarLinkCadastroBotao pacienteId={pacienteId} />

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-navy">Responsáveis Financeiros</h2>
            <ResponsaveisFinanceirosPaciente
              responsaveis={responsaveis}
              paraVincular={paraVincular}
              vincularExistenteAction={vincularAcaoComId}
              criarEVincularAction={criarEVincularAcaoComId}
              onDesvincular={desvincularAcaoComId}
            />
          </div>
        </div>
      )}

      {aba === "anamnese" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-navy">Anamnese</h2>
            <Link href={`/pacientes/${pacienteId}/anamnese/editar`} className="link">
              {anamnese ? "Editar anamnese" : "Registrar anamnese"}
            </Link>
          </div>

          {!anamnese ? (
            <p className="empty-state">Nenhuma anamnese registrada ainda.</p>
          ) : (
            <div className="card p-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {CAMPOS_ANAMNESE.map((c) => (
                <div key={c.chave}>
                  <p className="text-muted">{c.rotulo}</p>
                  <p className="whitespace-pre-line">{anamnese[c.chave] || "—"}</p>
                </div>
              ))}
            </div>
          )}

          {followups.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-navy mb-2">Histórico de atualizações</h3>
              <div className="space-y-3">
                {followups.map((f) => (
                  <div key={f.id} className="card p-4 text-sm space-y-2">
                    <p className="text-muted">
                      {new Date(f.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    {f.observacao && <p className="whitespace-pre-line">{f.observacao}</p>}
                    {f.alteracoes.length > 0 && (
                      <ul className="space-y-1">
                        {f.alteracoes.map((alt, i) => (
                          <li key={i} className="whitespace-pre-line">
                            <span className="font-semibold">{rotuloCampo(alt.campo)}:</span>{" "}
                            {alt.valor_anterior || "—"} → {alt.valor_novo || "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "sessoes" && (
        <div className="space-y-4">
          {credito.total > 0 && (
            <div className="card border border-green-200 bg-green-50 p-4 text-sm space-y-2">
              <p className="text-navy font-semibold">Crédito disponível: {formatarMoeda(credito.total)}</p>
              <div className="space-y-1">
                {credito.recebimentos.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {r.data_recebimento} · {formatarMoeda(r.saldo)} disponível
                    </span>
                    <DesfazerRecebimentoBotao
                      acao={excluirRecebimentoAcaoComId.bind(null, r.id)}
                      mensagemConfirmacao="Desfazer este recebimento? Sessões já quitadas com ele voltam a ficar pendentes."
                      className="link text-red-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {sessoes.length === 0 ? (
            <p className="empty-state">Nenhuma sessão registrada.</p>
          ) : (
            <div className="space-y-3">
              {sessoes.map((s) => (
                <div
                  key={s.id}
                  className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    {s.data} ({diaDaSemanaAbreviado(s.data)}) {s.horario?.slice(0, 5)}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted">{s.tipo_sessao}</span>
                    <span>{s.status ?? "Marcada"}</span>
                    <span className="text-muted">{formatarMoeda(s.valor)}</span>
                    {s.documentada && (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                        Documentada
                      </span>
                    )}
                    {s.saldo_devedor > 0 ? (
                      s.status !== "Cancelada" && (
                        <>
                          {s.cobranca_aberta_id ? (
                            <>
                              <Link
                                href={`/cobrancas/${s.cobranca_aberta_id}`}
                                className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800"
                              >
                                Cobrada
                              </Link>
                              <Link href={`/cobrancas/${s.cobranca_aberta_id}`} className="link text-xs">
                                Receba pela cobrança #{s.cobranca_aberta_id}
                              </Link>
                            </>
                          ) : (
                            <Link
                              href={`/sessoes/${s.id}/receber?voltarPara=${encodeURIComponent(`/pacientes/${pacienteId}?aba=sessoes`)}`}
                              className="link"
                            >
                              Receber
                            </Link>
                          )}
                          {!s.cobranca_aberta_id && (() => {
                            const recebimentoSuficiente = credito.recebimentos.find((r) => r.saldo >= s.saldo_devedor);
                            return (
                              recebimentoSuficiente && (
                                <UsarCreditoBotao
                                  pacienteId={pacienteId}
                                  sessaoId={s.id}
                                  recebimentoId={recebimentoSuficiente.id}
                                  valor={recebimentoSuficiente.saldo}
                                  onUsarCredito={usarCreditoNaSessao}
                                />
                              )
                            );
                          })()}
                        </>
                      )
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-green-700 font-semibold">Recebido</span>
                        {s.recebimento_id && (
                          <DesfazerRecebimentoBotao
                            acao={excluirRecebimentoAcaoComId.bind(null, s.recebimento_id)}
                            mensagemConfirmacao="Desfazer este recebimento? Se ele cobrir mais de uma sessão, todas voltam a ficar pendentes."
                            className="link text-red-600 text-xs"
                            rotulo="Desfazer recebimento"
                          />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "cobrancas" && (
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-navy">Sessões sem cobrança</h2>
            <AgruparSessoesForm
              pacienteId={pacienteId}
              sessoes={sessoesParaAgrupar}
              tipoDocumentoPadrao={tipoDocumentoDoPaciente(paciente.documento)}
              emissaoPorPadrao={paciente.nota_por_sessao === true ? "sessao" : "cobranca"}
              responsaveis={responsaveis}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-navy">Cobranças do paciente</h2>
            {cobrancas.length === 0 ? (
              <p className="empty-state">Nenhuma cobrança deste paciente.</p>
            ) : (
              <div className="space-y-3">
                {cobrancas.map((c) => (
                  <div key={c.id} className="card space-y-3 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold text-navy">{formatarMoeda(c.valor_total)}</span>
                      <span className="text-muted">
                        {c.data_inicio
                          ? c.data_inicio === c.data_fim
                            ? dataBR(c.data_inicio)
                            : `${dataBR(c.data_inicio)} a ${dataBR(c.data_fim)}`
                          : "—"}
                      </span>
                      <span className="text-muted">{ROTULOS_DOCUMENTO[c.tipo_documento] ?? c.tipo_documento}</span>
                      <SituacaoCobrancaBadge situacao={c.situacao} />
                      <Link href={`/cobrancas/${c.id}`} className="link">
                        Ver
                      </Link>
                    </div>
                    {c.situacao === "aberta" && (
                      <ReceberCobrancaToggle cobrancaId={c.id} contas={contas} hoje={hojeSaoPaulo()} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
