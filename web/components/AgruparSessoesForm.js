"use client";

import { useActionState, useState } from "react";
import { criarCobranca } from "@/lib/actions/cobrancas";
import { formatarMoeda } from "@/lib/formatar-moeda";
import { sessoesMarcadasPorPadrao, totalSelecionado } from "@/lib/cobranca";

const estadoInicial = {};

function dataBR(iso) {
  const [a, m, d] = String(iso ?? "").split("-");
  return a ? `${d}/${m}/${a}` : "—";
}

// sessoes: [{ id, data, horario, status, realizada, saldo }]; responsaveis: [{ id, nome, eh_proprio }].
// A action redireciona para a cobranca criada.
export default function AgruparSessoesForm({ pacienteId, sessoes, tipoDocumentoPadrao, responsaveis }) {
  const [state, formAction, pending] = useActionState(criarCobranca, estadoInicial);
  const [marcadas, setMarcadas] = useState(() => sessoesMarcadasPorPadrao(sessoes));
  const [tipo, setTipo] = useState(tipoDocumentoPadrao);
  const [responsavel, setResponsavel] = useState("");

  const marcadasAtuais = marcadas.filter((id) => sessoes.some((s) => s.id === id));
  const semResponsavel = responsaveis.length === 0;
  const variosResponsaveis = responsaveis.length > 1;

  function alternar(id) {
    setMarcadas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paciente" value={pacienteId} />

      {sessoes.length === 0 ? (
        <p className="empty-state">Nenhuma sessão sem cobrança.</p>
      ) : (
        <div className="card divide-y divide-border text-sm">
          {sessoes.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={marcadasAtuais.includes(s.id)}
                  onChange={() => alternar(s.id)}
                  className="h-4 w-4"
                />
                {dataBR(s.data)} {s.horario?.slice(0, 5)}
                <span className="text-muted">{s.realizada ? "Realizada" : s.status}</span>
              </span>
              <span className="font-semibold text-navy">{formatarMoeda(s.saldo)}</span>
            </label>
          ))}
        </div>
      )}

      {marcadasAtuais.map((sid) => (
        <input key={sid} type="hidden" name="sessao_id" value={sid} />
      ))}

      {sessoes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-navy">
            Total selecionado: {formatarMoeda(totalSelecionado(sessoes, marcadasAtuais))}
          </p>

          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="agrupar_tipo" className="block text-xs font-semibold text-navy">
                Documento
              </label>
              <select
                id="agrupar_tipo"
                name="tipo_documento"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="field"
              >
                <option value="nenhum">Nenhum</option>
                <option value="recibo">Recibo</option>
                <option value="nota_fiscal">Nota Fiscal</option>
              </select>
            </div>

            {variosResponsaveis && (
              <div>
                <label htmlFor="agrupar_resp" className="block text-xs font-semibold text-navy">
                  Responsável financeiro
                </label>
                <select
                  id="agrupar_resp"
                  name="responsavel_financeiro"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  required
                  className="field sm:max-w-72"
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                      {r.eh_proprio ? " (o próprio paciente)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {semResponsavel && (
            <p className="text-xs text-red-600">
              Cadastre um responsável financeiro para este paciente na aba Dados antes de criar a cobrança.
            </p>
          )}
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {sessoes.length > 0 && (
        <button
          type="submit"
          disabled={pending || marcadasAtuais.length === 0 || semResponsavel}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Agrupando..." : "Agrupar em cobrança"}
        </button>
      )}
    </form>
  );
}
