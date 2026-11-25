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

export function nomeArquivoNota(nota, extensao) {
  const serie = seguro(nota.serie) || "0";
  const numero = seguro(nota.numero) || String(nota.id);
  return `NFSe-${serie}-${numero}.${extensao}`;
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
