"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formatarMoeda } from "@/lib/formatar-moeda";
import {
  sessoesMarcadasPorPadrao,
  totalSelecionado,
  pacientesParaEnviar,
  gruposPorResponsavel,
  pacientePrincipal,
} from "@/lib/cobranca";

const ROTULO_TIPO = { nenhum: "Nenhum", recibo: "Recibo", nota_fiscal: "Nota Fiscal" };

const estadoInicial = {};

function dataBR(iso) {
  const [a, m, d] = String(iso ?? "").split("-");
  return a ? `${d}/${m}/${a}` : "—";
}

export default function NovaCobrancaMesForm({
  action,
  periodo,
  pacientes,
  rotuloMes,
}) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  // Pacientes marcados por padrao: so os que tem ao menos uma sessao realizada.
  const [marcados, setMarcados] = useState(() =>
    pacientes
      .filter((g) => g.sessoes.some((s) => s.realizada))
      .map((g) => g.paciente.id),
  );
  const [sessoesMarcadas, setSessoesMarcadas] = useState(() =>
    Object.fromEntries(
      pacientes.map((g) => [
        g.paciente.id,
        sessoesMarcadasPorPadrao(g.sessoes),
      ]),
    ),
  );
  const [abertos, setAbertos] = useState([]);
  const [tipos, setTipos] = useState(() =>
    Object.fromEntries(
      pacientes.map((g) => [g.paciente.id, g.tipoDocumentoPadrao]),
    ),
  );
  const [emissoes, setEmissoes] = useState(() =>
    Object.fromEntries(
      pacientes.map((g) => [g.paciente.id, g.emissaoPorPadrao ?? "cobranca"]),
    ),
  );
  const [responsaveisEscolhidos, setResponsaveisEscolhidos] = useState({});

  // Apenas pacientes presentes na lista atual (ids antigos de pacientes ja
  // cobrados, que saem da lista apos revalidar, sao ignorados).
  const idsAtuais = useMemo(
    () => pacientes.map((g) => g.paciente.id),
    [pacientes],
  );
  const marcadosAtuais = useMemo(
    () => marcados.filter((id) => idsAtuais.includes(id)),
    [marcados, idsAtuais],
  );
  const enviar = useMemo(
    () => pacientesParaEnviar(marcadosAtuais, sessoesMarcadas),
    [marcadosAtuais, sessoesMarcadas],
  );
  const semSessao = marcadosAtuais.filter((id) => !enviar.includes(id));

  // Responsavel efetivo de cada paciente incluido (unico vinculado ou o escolhido).
  // Pacientes que dividem o mesmo responsavel podem virar uma cobranca so.
  const [juntar, setJuntar] = useState({});
  const gruposComuns = useMemo(() => {
    const itens = enviar.map((id) => {
      const g = pacientes.find((p) => p.paciente.id === id);
      const resps = g?.responsaveis ?? [];
      const responsavelId = resps.length === 1 ? resps[0].id : Number(responsaveisEscolhidos[id]) || null;
      return { pacienteId: id, responsavelId };
    });
    return gruposPorResponsavel(itens).map((grupo) => {
      const membros = grupo.pacienteIds.map((id) => pacientes.find((p) => p.paciente.id === id));
      const sessoes = membros.flatMap((m) =>
        m.sessoes
          .filter((s) => (sessoesMarcadas[m.paciente.id] ?? []).includes(s.id))
          .map((s) => ({ ...s, paciente: m.paciente.id })),
      );
      const principalId = pacientePrincipal(sessoes) ?? membros[0].paciente.id;
      const nomeResp = membros[0].responsaveis.find((r) => r.id === grupo.responsavelId)?.nome ?? "o mesmo responsável";
      const tipoDe = (id) => tipos[id] ?? pacientes.find((p) => p.paciente.id === id).tipoDocumentoPadrao;
      return {
        ...grupo,
        nomeResp,
        nomes: membros.map((m) => m.paciente.nome),
        principalNome: membros.find((m) => m.paciente.id === principalId).paciente.nome,
        tipoPrincipal: tipoDe(principalId),
        tiposDiferentes: new Set(grupo.pacienteIds.map(tipoDe)).size > 1,
        total: totalSelecionado(sessoes, sessoes.map((s) => s.id)),
      };
    });
  }, [enviar, pacientes, responsaveisEscolhidos, sessoesMarcadas, tipos]);
  const juntando = gruposComuns.filter((g) => juntar[g.responsavelId] === "sim");
  const qtdCobrancas = enviar.length - juntando.reduce((n, g) => n + g.pacienteIds.length - 1, 0);

  function alternarPaciente(id) {
    setMarcados((a) =>
      a.includes(id) ? a.filter((x) => x !== id) : [...a, id],
    );
  }
  function alternarSessao(pacienteId, sessaoId) {
    setSessoesMarcadas((a) => {
      const atual = a[pacienteId] ?? [];
      return {
        ...a,
        [pacienteId]: atual.includes(sessaoId)
          ? atual.filter((x) => x !== sessaoId)
          : [...atual, sessaoId],
      };
    });
  }
  function alternarAberto(id) {
    setAbertos((a) =>
      a.includes(id) ? a.filter((x) => x !== id) : [...a, id],
    );
  }

  const vazio = pacientes.length === 0;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="periodo" value={periodo} />
      {vazio && !state?.criadas && !state?.falhas && (
        <p className="empty-state">
          Nenhum paciente com sessões pendentes de cobrança em {rotuloMes}.
        </p>
      )}

      <div className="space-y-3">
        {pacientes.map((g) => {
          const id = g.paciente.id;
          const marcado = marcadosAtuais.includes(id);
          const ids = sessoesMarcadas[id] ?? [];
          const aberto = abertos.includes(id);
          const incluido = enviar.includes(id);
          return (
            <div key={id} className="card px-4 py-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-6 sm:items-center">
                <label className="flex min-w-0 items-center gap-3 font-semibold text-navy sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarPaciente(id)}
                    className="h-4 w-4 shrink-0"
                    aria-label={`Incluir ${g.paciente.nome}`}
                  />
                  <span className="truncate">{g.paciente.nome}</span>
                </label>
                <p className="text-muted">
                  {ids.length} de {g.qtdSessoes}{" "}
                  {g.qtdSessoes === 1 ? "sessão" : "sessões"}
                </p>
                <p className="font-semibold text-navy">
                  {formatarMoeda(totalSelecionado(g.sessoes, ids))}
                </p>
                <select
                  name={incluido ? `tipo_documento_${id}` : undefined}
                  value={tipos[id] ?? g.tipoDocumentoPadrao}
                  onChange={(e) =>
                    setTipos((t) => ({ ...t, [id]: e.target.value }))
                  }
                  aria-label={`Documento de ${g.paciente.nome}`}
                  className="field mt-0"
                >
                  <option value="nenhum">Nenhum</option>
                  <option value="recibo">Recibo</option>
                  <option value="nota_fiscal">Nota Fiscal</option>
                </select>
                <button
                  type="button"
                  onClick={() => alternarAberto(id)}
                  className="link text-left text-sm sm:text-right"
                >
                  {aberto ? "Ocultar sessões" : "Ver sessões"}
                </button>
              </div>

              {(tipos[id] ?? g.tipoDocumentoPadrao) === "nota_fiscal" && (
                <div className="mt-3">
                  <label
                    htmlFor={`emissao_${id}`}
                    className="block text-xs font-semibold text-navy"
                  >
                    Emissão da nota
                  </label>
                  <select
                    id={`emissao_${id}`}
                    name={incluido ? `emissao_por_${id}` : undefined}
                    value={emissoes[id] ?? g.emissaoPorPadrao ?? "cobranca"}
                    onChange={(e) =>
                      setEmissoes((t) => ({ ...t, [id]: e.target.value }))
                    }
                    className="field sm:max-w-72"
                  >
                    <option value="cobranca">Uma nota por cobrança</option>
                    <option value="sessao">Uma nota por sessão</option>
                  </select>
                </div>
              )}

              {g.responsaveis?.length > 1 && (
                <div className="mt-3">
                  <label
                    htmlFor={`resp_${id}`}
                    className="block text-xs font-semibold text-navy"
                  >
                    Responsável financeiro
                  </label>
                  <select
                    id={`resp_${id}`}
                    name={incluido ? `responsavel_financeiro_${id}` : undefined}
                    value={responsaveisEscolhidos[id] ?? ""}
                    onChange={(e) =>
                      setResponsaveisEscolhidos((t) => ({
                        ...t,
                        [id]: e.target.value,
                      }))
                    }
                    required={incluido}
                    className="field sm:max-w-72"
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {g.responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                        {r.eh_proprio ? " (o próprio paciente)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {marcado && ids.length === 0 && (
                <p className="mt-2 text-xs text-red-600">
                  Marque ao menos uma sessão ou desmarque o paciente.
                </p>
              )}

              {aberto && (
                <div className="mt-3 divide-y divide-border rounded border border-border">
                  {g.sessoes.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={ids.includes(s.id)}
                          onChange={() => alternarSessao(id, s.id)}
                          className="h-4 w-4"
                        />
                        {dataBR(s.data)} {s.horario?.slice(0, 5)}
                        <span className="text-muted">
                          {s.realizada ? "Realizada" : s.status}
                        </span>
                      </span>
                      <span className="font-semibold text-navy">
                        {formatarMoeda(s.saldo)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Campos enviados: so paciente marcado com ao menos uma sessao marcada. */}
              {incluido && (
                <>
                  <input type="hidden" name="paciente_id" value={id} />
                  {ids.map((sid) => (
                    <input
                      key={sid}
                      type="hidden"
                      name={`sessao_id_${id}`}
                      value={sid}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>

      {gruposComuns.map((g) => {
        const valor = juntar[g.responsavelId] ?? "nao";
        return (
          <fieldset key={g.responsavelId} className="card space-y-2 border-l-4 border-l-yellow-500 px-4 py-3 text-sm">
            <legend className="sr-only">Juntar cobranças de {g.nomeResp}</legend>
            <p className="font-semibold text-navy">
              {g.nomes.join(", ")} têm o mesmo responsável financeiro ({g.nomeResp}). Juntar todas as sessões numa
              única cobrança, que vai gerar uma só nota?
            </p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`escolha_juntar_${g.responsavelId}`}
                  checked={valor === "sim"}
                  onChange={() => setJuntar((j) => ({ ...j, [g.responsavelId]: "sim" }))}
                />
                Sim, juntar ({formatarMoeda(g.total)})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`escolha_juntar_${g.responsavelId}`}
                  checked={valor === "nao"}
                  onChange={() => setJuntar((j) => ({ ...j, [g.responsavelId]: "nao" }))}
                />
                Não, manter uma cobrança por paciente
              </label>
            </div>
            {valor === "sim" && (
              <p className="text-xs text-muted">
                A cobrança fica no nome de {g.principalNome} (sessão mais antiga) e usa o documento dele:{" "}
                {ROTULO_TIPO[g.tipoPrincipal]}.
                {g.tiposDiferentes && " Os outros pacientes têm documentos diferentes; o dele prevalece."}
              </p>
            )}
            <input type="hidden" name={`juntar_${g.responsavelId}`} value={valor} />
          </fieldset>
        );
      })}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state?.criadas > 0 && (
        <p className="text-sm font-semibold text-navy">
          {state.criadas}{" "}
          {state.criadas === 1 ? "cobrança criada" : "cobranças criadas"}
          {state.juntadas > 0 && ` (${state.juntadas} reunindo vários pacientes)`}.{" "}
          <Link href="/cobrancas" className="link">
            Ver cobranças
          </Link>
        </p>
      )}
      {state?.falhas?.length > 0 && (
        <div className="text-sm text-red-600">
          <p className="font-semibold">Não foi possível criar para:</p>
          <ul className="list-disc pl-5">
            {state.falhas.map((f) => (
              <li key={f.pacienteId}>
                {f.nome}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vazio && (state?.criadas > 0 || state?.falhas?.length > 0) && (
        <p className="empty-state">
          Nenhum outro paciente com sessões pendentes de cobrança em {rotuloMes}
          .
        </p>
      )}

      {semSessao.length > 0 && (
        <p className="text-xs text-muted">
          Pacientes marcados sem nenhuma sessão marcada não serão incluídos.
        </p>
      )}

      {!vazio && (
        <button
          type="submit"
          disabled={pending || enviar.length === 0}
          className="btn-primary disabled:opacity-50"
        >
          {pending
            ? "Criando..."
            : `Criar ${qtdCobrancas} ${qtdCobrancas === 1 ? "cobrança" : "cobranças"}`}
        </button>
      )}
    </form>
  );
}
