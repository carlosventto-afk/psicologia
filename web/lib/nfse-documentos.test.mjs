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

test("documentosFaltantes respeita o formato pedido", () => {
  const nota = { xml_nfse: "<a/>", pdf_base64: null };
  assert.deepEqual(documentosFaltantes(nota, ["pdf", "xml"]), { xml: false, pdf: true });
  assert.deepEqual(documentosFaltantes(nota, ["xml"]), { xml: false, pdf: false });
});

test("bytesDoDocumento", () => {
  const nota = { xml_nfse: "<nfse>ç</nfse>", pdf_base64: Buffer.from("PDF!").toString("base64") };
  assert.equal(bytesDoDocumento(nota, "pdf").toString(), "PDF!");
  assert.equal(bytesDoDocumento(nota, "xml").toString("utf-8"), "<nfse>ç</nfse>");
  assert.equal(bytesDoDocumento({}, "pdf"), null);
  assert.equal(bytesDoDocumento({ xml_nfse: "  " }, "xml"), null);
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
