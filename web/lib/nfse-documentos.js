// Download do PDF (DANFSe oficial) e do XML da NFS-e, individual ou em bloco (.zip).
// Funções puras — a rota /api/notas-fiscais/download faz a E/S.

export const FORMATOS = ["pdf", "xml", "todos"];
export const LIMITE_NOTAS_EM_BLOCO = 100;

// 'pdf' | 'xml' | 'todos' -> quais extensões baixar. Formato inválido -> null.
export function extensoesDoFormato(formato) {
  if (formato === "pdf") return ["pdf"];
  if (formato === "xml") return ["xml"];
  if (formato === "todos") return ["pdf", "xml"];
  return null;
}

// "1,2,3" ou ["1","2"] -> ids inteiros positivos, únicos, na ordem de entrada.
export function normalizarIdsNotas(entrada) {
  const brutos = Array.isArray(entrada) ? entrada : String(entrada ?? "").split(",");
  const vistos = new Set();
  for (const b of brutos) {
    const texto = String(b).trim();
    if (!/^\d+$/.test(texto)) continue;
    const n = Number(texto);
    if (Number.isSafeInteger(n) && n > 0) vistos.add(n);
  }
  return [...vistos];
}

const seguro = (v) => String(v ?? "").replace(/[^A-Za-z0-9._-]/g, "");

// Competência do serviço ("YYYY-MM-DD") gravada na DPS enviada (tag dCompet);
// null se o XML não existir. NotaFiscal não tem coluna própria para isso.
export function competenciaDoXmlDps(xmlDps) {
  const m = /<dCompet>\s*(\d{4}-\d{2}-\d{2})\s*<\/dCompet>/.exec(String(xmlDps ?? ""));
  return m ? m[1] : null;
}

export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Filtro por intervalo de competência (inclusivo; "de"/"ate" ISO, qualquer um opcional).
// Valor inválido é ignorado. Nota sem competência conhecida só passa sem filtro.
export function filtrarPorCompetencia(notas, de, ate) {
  const ini = DATA_ISO.test(de ?? "") ? de : null;
  const fim = DATA_ISO.test(ate ?? "") ? ate : null;
  if (!ini && !fim) return notas;
  return notas.filter((n) => {
    if (!n.competencia) return false;
    return (!ini || n.competencia >= ini) && (!fim || n.competencia <= fim);
  });
}

// Só notas autorizadas (ou canceladas, que continuam tendo documento) têm arquivo.
export function notaTemDocumento(nota) {
  return Boolean(nota) && (nota.status === "autorizada" || nota.status === "cancelada") && Boolean(nota.chave_acesso);
}

// ---------------------------------------------------------------------------
// Nome dos arquivos baixados:
//   Responsável - Paciente - pg <data do pagamento> at <mês e ano dos atendimentos> - NFSe-série-número.ext
// Peça que falta é pulada; sem nenhuma, fica só NFSe-série-número.ext (nota antiga, sem vínculos).
// ---------------------------------------------------------------------------

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const LIMITE_NOME_PJ = 40;
const LIMITE_PACIENTES = 60;

const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chaveNome = (s) => semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();
// Tira o que o sistema de arquivos proíbe e junta os espaços.
const limparPeca = (s) => String(s ?? "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
const limitar = (s, max) => (s.length <= max ? s : s.slice(0, max).trim());
const emLista = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const listaComE = (itens) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

// Primeiro nome; tudo em maiúsculas (ou minúsculas) vira "Marta", caixa mista fica como está.
export function primeiroNome(nome) {
  const token = limparPeca(String(nome ?? "").trim().split(/\s+/)[0]);
  if (!token) return "";
  const maiusculo = token.toLocaleUpperCase("pt-BR");
  const minusculo = token.toLocaleLowerCase("pt-BR");
  if (token !== maiusculo && token !== minusculo) return token;
  return maiusculo.charAt(0) + minusculo.slice(1);
}

// "YYYY-MM-DD..." -> "dd-mm-aaaa" (barra não vale em nome de arquivo); inválido -> "".
export function dataParaArquivo(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Mês e ano dos atendimentos por extenso: "outubro 2026", "outubro e novembro 2026",
// "dezembro 2026 e janeiro 2027".
export function mesesDosAtendimentos(datasISO) {
  const meses = [
    ...new Set(
      (datasISO ?? []).map((d) => String(d).slice(0, 7)).filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)),
    ),
  ].sort();
  const grupos = [];
  for (const m of meses) {
    const [ano, mes] = m.split("-");
    const nome = MESES[Number(mes) - 1];
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.ano === ano) ultimo.nomes.push(nome);
    else grupos.push({ ano, nomes: [nome] });
  }
  return listaComE(grupos.map((g) => `${listaComE(g.nomes)} ${g.ano}`));
}

// O que o nome do arquivo precisa saber da nota, lido do select da rota de download
// (tomador_nome, tomador_documento e os vínculos Cobranca / RecebimentoSessao embutidos).
// dataPagamento é a do recebimento da cobrança; as sessões vêm em ordem de data.
export function contextoDoNomeArquivo(nota) {
  const cobranca = nota?.Cobranca ?? null;
  const rateio = nota?.RecebimentoSessao ?? null;
  const recebimento = cobranca?.Recebimento ?? rateio?.Recebimento ?? null;
  const sessoes = (cobranca ? emLista(cobranca.Recebimento?.RecebimentoSessao).map((r) => r?.Sessao) : [rateio?.Sessao])
    .filter((s) => s && s.data)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const vistos = new Set();
  const pacientes = [];
  for (const s of sessoes) {
    const nome = String(s.Paciente?.nome ?? "").trim();
    if (!nome) continue;
    const chave = s.Paciente.id ?? nome;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pacientes.push(nome);
  }

  const nomeResponsavel = String(nota?.tomador_nome ?? "").trim();
  return {
    responsavel: nomeResponsavel ? { nome: nomeResponsavel, documento: nota.tomador_documento ?? null } : null,
    pacientes,
    dataPagamento: recebimento?.data_recebimento ?? null,
    datasAtendimento: sessoes.map((s) => String(s.data).slice(0, 10)),
  };
}

function partesDoNome(contexto) {
  const responsavel = contexto?.responsavel;
  const nomeResponsavel = String(responsavel?.nome ?? "").trim();
  // Responsável CNPJ (empresa): o nome inteiro, o primeiro nome não identificaria ninguém.
  const pessoaJuridica = apenasDigitos(responsavel?.documento).length === 14;
  const responsavelCurto = !nomeResponsavel
    ? ""
    : pessoaJuridica
      ? limitar(limparPeca(nomeResponsavel), LIMITE_NOME_PJ)
      : primeiroNome(nomeResponsavel);

  // O responsável que também é o paciente (nota no nome do próprio paciente) aparece uma vez só.
  const chaveResponsavel = chaveNome(nomeResponsavel);
  const vistos = new Set();
  const pacientes = [];
  for (const nome of contexto?.pacientes ?? []) {
    const chave = chaveNome(nome);
    if (!chave || chave === chaveResponsavel || vistos.has(chave)) continue;
    vistos.add(chave);
    const curto = primeiroNome(nome);
    if (curto) pacientes.push(curto);
  }

  const pagamento = dataParaArquivo(contexto?.dataPagamento);
  const meses = mesesDosAtendimentos(contexto?.datasAtendimento);
  const quando = [pagamento && `pg ${pagamento}`, meses && `at ${meses}`].filter(Boolean).join(" ");
  return [responsavelCurto, limitar(listaComE(pacientes), LIMITE_PACIENTES), quando].filter(Boolean);
}

export function nomeArquivoNota(nota, extensao, contexto = null) {
  const serie = seguro(nota.serie) || "0";
  const numero = seguro(nota.numero) || String(nota.id);
  const partes = contexto ? partesDoNome(contexto) : [];
  return `${[...partes, `NFSe-${serie}-${numero}`].join(" - ")}.${extensao}`;
}

// Cabeçalho Content-Disposition seguro para nome com acento: filename ASCII de reserva (navegadores
// antigos) e filename* em UTF-8 (RFC 6266). Caractere fora do latin1 quebraria o cabeçalho HTTP.
export function contentDispositionAnexo(nome) {
  const ascii = semAcento(nome).replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// Nomes repetidos (no mesmo .zip) ganham " (2)", " (3)" antes da extensão.
export function nomesUnicos(nomes) {
  const usados = new Map();
  return nomes.map((nome) => {
    const n = (usados.get(nome) ?? 0) + 1;
    usados.set(nome, n);
    if (n === 1) return nome;
    const ponto = nome.lastIndexOf(".");
    const base = ponto > 0 ? nome.slice(0, ponto) : nome;
    const extensao = ponto > 0 ? nome.slice(ponto) : "";
    return `${base} (${n})${extensao}`;
  });
}

const temTexto = (v) => String(v ?? "").trim() !== "";

// O que ainda precisa ser buscado na SEFIN (só o dono, com o certificado), dado o formato pedido.
// O XML é o documento fiscal e não se refaz; o PDF se desenha na hora a partir do XML, então só
// falta PDF quando não há XML nem PDF guardado (e, nesse caso, o XML é buscado junto).
export function documentosFaltantes(nota, extensoes) {
  const semXml = !temTexto(nota.xml_nfse);
  const pdf = extensoes.includes("pdf") && semXml && !temTexto(nota.pdf_base64);
  return { xml: semXml && (extensoes.includes("xml") || pdf), pdf };
}

// pdfGerado: PDF recém-desenhado a partir do XML (Buffer); tem prioridade sobre o guardado,
// que fica de reserva (serviço fora do ar, XML ausente).
export function bytesDoDocumento(nota, extensao, pdfGerado = null) {
  if (extensao === "pdf") {
    if (pdfGerado) return pdfGerado;
    return temTexto(nota.pdf_base64) ? Buffer.from(nota.pdf_base64, "base64") : null;
  }
  return temTexto(nota.xml_nfse) ? Buffer.from(nota.xml_nfse, "utf-8") : null;
}

export const CONTENT_TYPE = { pdf: "application/pdf", xml: "application/xml; charset=utf-8" };

// ---------------------------------------------------------------------------
// ZIP mínimo (método "store", sem compressão) — PDFs já são comprimidos e o XML é
// pequeno; evita dependência nova. Nomes em UTF-8 (flag 0x0800).
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataHoraDos(data) {
  const ano = Math.max(data.getFullYear(), 1980);
  const hora = (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1);
  const dia = ((ano - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
  return { hora, dia };
}

// arquivos: [{ nome: string, conteudo: Buffer }] -> Buffer do .zip
export function montarZip(arquivos, agora = new Date()) {
  const { hora, dia } = dataHoraDos(agora);
  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const { nome, conteudo } of arquivos) {
    const nomeBuf = Buffer.from(nome, "utf-8");
    const crc = crc32(conteudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(conteudo.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nomeBuf, conteudo);

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4);
    entrada.writeUInt16LE(20, 6);
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(0, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(dia, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(conteudo.length, 20);
    entrada.writeUInt32LE(conteudo.length, 24);
    entrada.writeUInt16LE(nomeBuf.length, 28);
    entrada.writeUInt32LE(deslocamento, 42);
    central.push(entrada, nomeBuf);

    deslocamento += local.length + nomeBuf.length + conteudo.length;
  }

  const centralBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(centralBuf.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...partes, centralBuf, fim]);
}
