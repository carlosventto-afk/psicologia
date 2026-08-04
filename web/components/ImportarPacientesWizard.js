"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import XLSX from "xlsx";
import { importarPacientes, desfazerImportacao } from "@/lib/actions/importar-pacientes";

const CAMPOS = [
  { chave: "nome", rotulo: "Nome", obrigatorio: true, aliases: ["nome"] },
  {
    chave: "data_nascimento",
    rotulo: "Data de Nascimento",
    obrigatorio: false,
    aliases: ["data de nascimento", "data nascimento", "nascimento"],
  },
  { chave: "telefone", rotulo: "Telefone", obrigatorio: false, aliases: ["telefone", "celular", "whatsapp"] },
  { chave: "email", rotulo: "E-mail", obrigatorio: false, aliases: ["e-mail", "email"] },
  { chave: "endereco", rotulo: "Endereço", obrigatorio: false, aliases: ["endereco", "endereço"] },
  {
    chave: "valor_sessao",
    rotulo: "Valor da Sessão",
    obrigatorio: false,
    aliases: ["valor da sessao", "valor da sessão", "valor"],
  },
  {
    chave: "observacoes",
    rotulo: "Observações",
    obrigatorio: false,
    aliases: ["observacoes", "observações", "observacao"],
  },
  {
    chave: "precisa_recibo",
    rotulo: "Precisa de recibo",
    obrigatorio: false,
    aliases: ["precisa de recibo", "recibo"],
  },
];

function semAcentos(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectarMapeamentoInicial(cabecalhos) {
  const mapeamento = {};
  for (const campo of CAMPOS) {
    const indice = cabecalhos.findIndex((cabecalho) => campo.aliases.includes(semAcentos(String(cabecalho))));
    mapeamento[campo.chave] = indice >= 0 ? indice : "";
  }
  return mapeamento;
}

function celulaParaTexto(valor) {
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}/${valor.getFullYear()}`;
  }
  return String(valor ?? "").trim();
}

async function parsearArquivo(arquivo) {
  const nomeArquivo = arquivo.name.toLowerCase();
  let workbook;

  if (nomeArquivo.endsWith(".csv")) {
    const texto = await arquivo.text();
    workbook = XLSX.read(texto, { type: "string", raw: true });
  } else {
    const buffer = await arquivo.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  }

  const aba = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: "" });
  if (linhas.length === 0) throw new Error("A planilha está vazia.");

  const [cabecalhos, ...resto] = linhas;
  const linhasComDados = resto
    .map((linha, indice) => ({ linha, numeroLinha: indice + 2 }))
    .filter(({ linha }) => linha.some((celula) => String(celula ?? "").trim() !== ""));

  if (linhasComDados.length === 0) {
    throw new Error("Nenhuma linha com dados encontrada na planilha.");
  }

  return {
    cabecalhos: cabecalhos.map((c) => String(c ?? "").trim()),
    linhas: linhasComDados,
  };
}

export default function ImportarPacientesWizard({ consultorios }) {
  const [passo, setPasso] = useState(1);
  const [erro, setErro] = useState("");
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [cabecalhos, setCabecalhos] = useState([]);
  const [linhasBrutas, setLinhasBrutas] = useState([]);
  const [consultorioId, setConsultorioId] = useState(consultorios[0]?.id ?? "");
  const [mapeamento, setMapeamento] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const linhasMapeadas = useMemo(() => {
    return linhasBrutas.map(({ linha, numeroLinha }) => {
      const objeto = { numeroLinha };
      for (const campo of CAMPOS) {
        const indice = mapeamento[campo.chave];
        objeto[campo.chave] = indice === "" || indice === undefined ? "" : celulaParaTexto(linha[indice]);
      }
      return objeto;
    });
  }, [linhasBrutas, mapeamento]);

  async function aoSelecionarArquivo(event) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setErro("");
    setCarregandoArquivo(true);
    try {
      const { cabecalhos: cabecalhosLidos, linhas } = await parsearArquivo(arquivo);
      setCabecalhos(cabecalhosLidos);
      setLinhasBrutas(linhas);
      setMapeamento(detectarMapeamentoInicial(cabecalhosLidos));
      setNomeArquivo(arquivo.name);
    } catch (erroLeitura) {
      setErro(`Não foi possível ler o arquivo: ${erroLeitura.message}`);
      setCabecalhos([]);
      setLinhasBrutas([]);
      setNomeArquivo("");
    } finally {
      setCarregandoArquivo(false);
    }
  }

  async function aoConfirmar() {
    setEnviando(true);
    setErro("");
    try {
      const relatorio = await importarPacientes(Number(consultorioId), linhasMapeadas);
      if (relatorio?.error) {
        setErro(relatorio.error);
      } else {
        setResultado(relatorio);
      }
    } catch (erroImportacao) {
      setErro("Não foi possível importar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function aoDesfazer() {
    setEnviando(true);
    try {
      const resposta = await desfazerImportacao(resultado.idsInseridos);
      if (resposta?.error) {
        setErro(resposta.error);
      } else {
        setResultado({ ...resultado, desfeito: true });
      }
    } catch (erroDesfazer) {
      setErro("Não foi possível desfazer. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="max-w-2xl space-y-4 card p-6">
        <h2 className="text-lg font-bold text-navy">Resultado da importação</h2>

        {resultado.desfeito ? (
          <p className="text-sm font-semibold text-navy">
            Importação desfeita — nenhum paciente desta leva foi mantido.
          </p>
        ) : (
          <ul className="text-sm text-navy space-y-1">
            <li>Total de linhas na planilha: {resultado.totalLinhas}</li>
            <li className="font-semibold">Pacientes importados: {resultado.importados}</li>
            <li>Puladas por falta de nome: {resultado.puladosSemNome}</li>
            <li>Puladas por já existirem (duplicadas): {resultado.puladosDuplicados.length}</li>
          </ul>
        )}

        {!resultado.desfeito && resultado.puladosDuplicados.length > 0 && (
          <div className="text-sm text-muted">
            <p className="font-semibold text-navy">Duplicadas:</p>
            <ul className="list-disc list-inside">
              {resultado.puladosDuplicados.map((item) => (
                <li key={`${item.linha}-${item.nome}`}>
                  Linha {item.linha}: {item.nome}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!resultado.desfeito && resultado.avisos.length > 0 && (
          <div className="text-sm text-muted">
            <p className="font-semibold text-navy">Avisos:</p>
            <ul className="list-disc list-inside">
              {resultado.avisos.map((item, indice) => (
                <li key={`${item.linha}-${item.campo}-${indice}`}>
                  Linha {item.linha} ({item.nome}): {item.campo} — {item.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex gap-3">
          <Link href="/pacientes" className="btn-primary">
            Voltar para pacientes
          </Link>
          {!resultado.desfeito && resultado.importados > 0 && (
            <button
              type="button"
              onClick={aoDesfazer}
              disabled={enviando}
              className="btn-danger disabled:opacity-50"
            >
              {enviando ? "Desfazendo..." : "Desfazer importação"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2 text-sm text-muted">
        <span className={passo === 1 ? "font-bold text-navy" : ""}>1. Upload</span>
        <span>›</span>
        <span className={passo === 2 ? "font-bold text-navy" : ""}>2. Consultório</span>
        <span>›</span>
        <span className={passo === 3 ? "font-bold text-navy" : ""}>3. Mapear colunas</span>
        <span>›</span>
        <span className={passo === 4 ? "font-bold text-navy" : ""}>4. Prévia</span>
      </div>

      {passo === 1 && (
        <div className="card p-6 space-y-4">
          <div>
            <label htmlFor="arquivo" className="block text-sm font-semibold text-navy">
              Selecione a planilha (.xlsx ou .csv)
            </label>
            <input id="arquivo" type="file" accept=".xlsx,.csv" onChange={aoSelecionarArquivo} className="field" />
          </div>

          <a href="/planilha-modelo-pacientes.xlsx" download className="link text-sm">
            Baixar planilha modelo
          </a>

          {carregandoArquivo && <p className="text-sm text-muted">Lendo arquivo...</p>}
          {erro && <p className="text-sm text-red-600">{erro}</p>}

          {nomeArquivo && !carregandoArquivo && !erro && (
            <p className="text-sm text-navy">
              <strong>{nomeArquivo}</strong>: {cabecalhos.length} coluna(s) e {linhasBrutas.length} linha(s)
              detectadas.
            </p>
          )}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button
              type="button"
              disabled={linhasBrutas.length === 0}
              onClick={() => setPasso(2)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="card p-6 space-y-4">
          <div>
            <label htmlFor="consultorio" className="block text-sm font-semibold text-navy">
              Consultório (aplicado a todos os pacientes desta importação)
            </label>
            <select
              id="consultorio"
              value={consultorioId}
              onChange={(event) => setConsultorioId(event.target.value)}
              className="field"
            >
              {consultorios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(1)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={!consultorioId}
              onClick={() => setPasso(3)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Escolha qual coluna da planilha corresponde a cada campo do cadastro. Nome é obrigatório; os demais
            podem ficar como "Nenhuma".
          </p>

          {CAMPOS.map((campo) => (
            <div key={campo.chave}>
              <label htmlFor={`mapa-${campo.chave}`} className="block text-sm font-semibold text-navy">
                {campo.rotulo}
                {campo.obrigatorio ? " *" : ""}
              </label>
              <select
                id={`mapa-${campo.chave}`}
                value={mapeamento[campo.chave] ?? ""}
                onChange={(event) =>
                  setMapeamento((atual) => ({
                    ...atual,
                    [campo.chave]: event.target.value === "" ? "" : Number(event.target.value),
                  }))
                }
                className="field"
              >
                <option value="">Nenhuma</option>
                {cabecalhos.map((cabecalho, indice) => (
                  <option key={indice} value={indice}>
                    {cabecalho || `Coluna ${indice + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(2)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={mapeamento.nome === "" || mapeamento.nome === undefined}
              onClick={() => setPasso(4)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Prévia de {linhasMapeadas.length} paciente(s) que serão importados no consultório selecionado.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-navy font-semibold">
                  {CAMPOS.map((campo) => (
                    <th key={campo.chave} className="px-2 py-1 whitespace-nowrap">
                      {campo.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasMapeadas.map((linha) => (
                  <tr key={linha.numeroLinha} className="border-t border-[var(--color-border)]">
                    {CAMPOS.map((campo) => (
                      <td key={campo.chave} className="px-2 py-1 whitespace-nowrap">
                        {linha[campo.chave] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(3)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={aoConfirmar}
              className="btn-primary disabled:opacity-50"
            >
              {enviando ? "Importando..." : "Confirmar importação"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
