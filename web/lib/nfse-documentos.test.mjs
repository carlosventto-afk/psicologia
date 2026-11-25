import test from "node:test";
import assert from "node:assert/strict";
import { crc32 as crc32Zlib } from "node:zlib";
import {
  extensoesDoFormato,
  normalizarIdsNotas,
  notaTemDocumento,
  nomeArquivoNota,
  documentosFaltantes,
  bytesDoDocumento,
  crc32,
  montarZip,
  competenciaDoXmlDps,
  filtrarPorCompetencia,
} from "./nfse-documentos.js";

test("extensoesDoFormato", () => {
  assert.deepEqual(extensoesDoFormato("pdf"), ["pdf"]);
  assert.deepEqual(extensoesDoFormato("xml"), ["xml"]);
  assert.deepEqual(extensoesDoFormato("todos"), ["pdf", "xml"]);
  assert.equal(extensoesDoFormato("exe"), null);
  assert.equal(extensoesDoFormato(undefined), null);
});

test("normalizarIdsNotas aceita lista com vírgula e array, descarta lixo e repetidos", () => {
  assert.deepEqual(normalizarIdsNotas("3, 1,3,abc,-2,0,1.5"), [3, 1]);
  assert.deepEqual(normalizarIdsNotas(["5", "5", "x", "7"]), [5, 7]);
  assert.deepEqual(normalizarIdsNotas(null), []);
});

test("notaTemDocumento: só autorizada/cancelada com chave", () => {
  assert.equal(notaTemDocumento({ status: "autorizada", chave_acesso: "K" }), true);
  assert.equal(notaTemDocumento({ status: "cancelada", chave_acesso: "K" }), true);
  assert.equal(notaTemDocumento({ status: "autorizada", chave_acesso: null }), false);
  assert.equal(notaTemDocumento({ status: "pendente", chave_acesso: "K" }), false);
  assert.equal(notaTemDocumento(null), false);
});

test("nomeArquivoNota remove caracteres perigosos", () => {
  assert.equal(nomeArquivoNota({ id: 9, serie: "1", numero: 7 }, "pdf"), "NFSe-1-7.pdf");
  assert.equal(nomeArquivoNota({ id: 9, serie: "../x", numero: "a/b" }, "xml"), "NFSe-..x-ab.xml");
  assert.equal(nomeArquivoNota({ id: 9, serie: null, numero: null }, "xml"), "NFSe-0-9.xml");
});

test("documentosFaltantes: com XML o PDF se desenha na hora, então nada falta", () => {
  const nota = { xml_nfse: "<a/>", pdf_base64: null };
  assert.deepEqual(documentosFaltantes(nota, ["pdf", "xml"]), { xml: false, pdf: false });
  assert.deepEqual(documentosFaltantes(nota, ["pdf"]), { xml: false, pdf: false });
  assert.deepEqual(documentosFaltantes(nota, ["xml"]), { xml: false, pdf: false });
});

test("documentosFaltantes: sem XML, busca o XML; sem XML nem PDF guardado, busca os dois", () => {
  const semNada = { xml_nfse: null, pdf_base64: null };
  assert.deepEqual(documentosFaltantes(semNada, ["xml"]), { xml: true, pdf: false });
  assert.deepEqual(documentosFaltantes(semNada, ["pdf"]), { xml: true, pdf: true });
  assert.deepEqual(documentosFaltantes(semNada, ["pdf", "xml"]), { xml: true, pdf: true });
  const soPdf = { xml_nfse: " ", pdf_base64: "UERG" };
  assert.deepEqual(documentosFaltantes(soPdf, ["pdf"]), { xml: false, pdf: false });
  assert.deepEqual(documentosFaltantes(soPdf, ["xml"]), { xml: true, pdf: false });
});

test("bytesDoDocumento", () => {
  const nota = { xml_nfse: "<nfse>ç</nfse>", pdf_base64: Buffer.from("PDF!").toString("base64") };
  assert.equal(bytesDoDocumento(nota, "pdf").toString(), "PDF!");
  assert.equal(bytesDoDocumento(nota, "xml").toString("utf-8"), "<nfse>ç</nfse>");
  assert.equal(bytesDoDocumento({}, "pdf"), null);
  assert.equal(bytesDoDocumento({ xml_nfse: "  " }, "xml"), null);
});

test("bytesDoDocumento: PDF recém-gerado tem prioridade sobre o guardado, que é a reserva", () => {
  const nota = { xml_nfse: "<a/>", pdf_base64: Buffer.from("VELHO").toString("base64") };
  assert.equal(bytesDoDocumento(nota, "pdf", Buffer.from("NOVO")).toString(), "NOVO");
  assert.equal(bytesDoDocumento(nota, "pdf", null).toString(), "VELHO");
  assert.equal(bytesDoDocumento({ xml_nfse: "<a/>" }, "pdf", Buffer.from("NOVO")).toString(), "NOVO");
  assert.equal(bytesDoDocumento({ xml_nfse: "<a/>" }, "pdf", null), null);
  // o PDF gerado não interfere no XML
  assert.equal(bytesDoDocumento(nota, "xml", Buffer.from("NOVO")).toString("utf-8"), "<a/>");
});

test("crc32 bate com o do node:zlib", () => {
  const dados = Buffer.from("PsiAgente NFS-e — ação");
  assert.equal(crc32(dados), crc32Zlib(dados));
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("montarZip gera estrutura válida (assinaturas, contagem e conteúdo)", () => {
  const a = Buffer.from("conteudo A");
  const b = Buffer.from("<nfse>é</nfse>");
  const zip = montarZip([
    { nome: "NFSe-1-1.pdf", conteudo: a },
    { nome: "NFSe-1-1.xml", conteudo: b },
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const fim = zip.length - 22;
  assert.equal(zip.readUInt32LE(fim), 0x06054b50);
  assert.equal(zip.readUInt16LE(fim + 10), 2);
  const tamCentral = zip.readUInt32LE(fim + 12);
  const offCentral = zip.readUInt32LE(fim + 16);
  assert.equal(offCentral + tamCentral, fim);
  assert.equal(zip.readUInt32LE(offCentral), 0x02014b50);
  assert.ok(zip.includes(a));
  assert.ok(zip.includes(b));
});

test("montarZip sem arquivos ainda é um zip vazio válido", () => {
  const zip = montarZip([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
});

test("competenciaDoXmlDps lê dCompet da DPS", () => {
  assert.equal(competenciaDoXmlDps("<infDPS><dCompet>2026-11-05</dCompet></infDPS>"), "2026-11-05");
  assert.equal(competenciaDoXmlDps("<x/>"), null);
  assert.equal(competenciaDoXmlDps(null), null);
});

test("filtrarPorCompetencia: intervalo inclusivo, abertos e inválidos", () => {
  const notas = [
    { id: 1, competencia: "2026-10-31" },
    { id: 2, competencia: "2026-11-01" },
    { id: 3, competencia: "2026-11-30" },
    { id: 4, competencia: "2026-12-01" },
    { id: 5, competencia: null },
  ];
  const ids = (l) => l.map((n) => n.id);
  assert.deepEqual(ids(filtrarPorCompetencia(notas, "2026-11-01", "2026-11-30")), [2, 3]);
  assert.deepEqual(ids(filtrarPorCompetencia(notas, "2026-11-30", "")), [3, 4]);
  assert.deepEqual(ids(filtrarPorCompetencia(notas, "", "2026-10-31")), [1]);
  assert.deepEqual(ids(filtrarPorCompetencia(notas, "lixo", undefined)), [1, 2, 3, 4, 5]);
});
