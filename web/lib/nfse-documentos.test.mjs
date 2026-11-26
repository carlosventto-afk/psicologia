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
  primeiroNome,
  dataParaArquivo,
  mesesDosAtendimentos,
  contextoDoNomeArquivo,
  contentDispositionAnexo,
  nomesUnicos,
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

// ---------------------------------------------------------------------------
// Nome do arquivo: Responsável - Paciente - pg <data do pagamento> at <mês ano> - NFSe-série-número
// ---------------------------------------------------------------------------

const nota11 = { id: 9, serie: "1", numero: 11 };
const contextoCompleto = {
  responsavel: { nome: "Marta Alves Souza", documento: "12345678909" },
  pacientes: ["Helena Prado Souza"],
  dataPagamento: "2026-11-08",
  datasAtendimento: ["2026-10-02", "2026-10-09", "2026-10-30"],
};

test("nomeArquivoNota com contexto: responsável - paciente - pg data do pagamento at mês e ano - NFSe", () => {
  const base = "Marta - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11";
  assert.equal(nomeArquivoNota(nota11, "pdf", contextoCompleto), `${base}.pdf`);
  assert.equal(nomeArquivoNota(nota11, "xml", contextoCompleto), `${base}.xml`);
  assert.equal(nomeArquivoNota(nota11, "zip", contextoCompleto), `${base}.zip`);
});

test("nomeArquivoNota: a data é a do pagamento (aceita timestamp), não a competência", () => {
  const ctx = { ...contextoCompleto, dataPagamento: "2026-11-08T00:00:00+00:00", competencia: "2026-10-30" };
  assert.equal(nomeArquivoNota(nota11, "pdf", ctx), "Marta - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
});

test("nomeArquivoNota: primeiro nome com caixa arrumada; nome misto é mantido", () => {
  const ctx = {
    ...contextoCompleto,
    responsavel: { nome: "MARTA ALVES SOUZA", documento: "12345678909" },
    pacientes: ["helena ferreira"],
  };
  assert.equal(nomeArquivoNota(nota11, "pdf", ctx), "Marta - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
  assert.equal(primeiroNome("McDonald Silva"), "McDonald");
  assert.equal(primeiroNome("  ana  paula "), "Ana");
  assert.equal(primeiroNome(""), "");
  assert.equal(primeiroNome(null), "");
});

test("nomeArquivoNota: vários pacientes ficam juntos com 'e'", () => {
  const dois = { ...contextoCompleto, pacientes: ["Helena Prado", "João Pedro Alves"] };
  assert.equal(nomeArquivoNota(nota11, "pdf", dois), "Marta - Helena e João - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
  const tres = { ...contextoCompleto, pacientes: ["Helena Prado", "João Pedro Alves", "Maria Souza"] };
  assert.equal(nomeArquivoNota(nota11, "pdf", tres), "Marta - Helena, João e Maria - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
});

test("nomeArquivoNota: nota no nome do próprio paciente mostra o nome uma vez só", () => {
  const ctx = { ...contextoCompleto, responsavel: { nome: "Helena Prado Souza", documento: "52998224725" } };
  assert.equal(nomeArquivoNota(nota11, "pdf", ctx), "Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
});

test("nomeArquivoNota: responsável que também é paciente não se repete (compara o nome inteiro, sem acento nem caixa)", () => {
  const ctx = { ...contextoCompleto, pacientes: ["MARTA ALVES SOUZA", "Helena Prado"] };
  assert.equal(nomeArquivoNota(nota11, "pdf", ctx), "Marta - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
  const outra = { ...contextoCompleto, responsavel: { nome: "Maria Silva", documento: "1" }, pacientes: ["Maria Souza"] };
  assert.equal(nomeArquivoNota(nota11, "pdf", outra), "Maria - Maria - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
});

test("nomeArquivoNota: responsável CNPJ usa o nome inteiro (limitado)", () => {
  const ctx = { ...contextoCompleto, responsavel: { nome: "Clínica Saúde Total Ltda", documento: "12.345.678/0001-95" } };
  assert.equal(nomeArquivoNota(nota11, "pdf", ctx), "Clínica Saúde Total Ltda - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
  const longo = { ...ctx, responsavel: { nome: "A".repeat(100), documento: "12345678000195" } };
  const nome = nomeArquivoNota(nota11, "pdf", longo);
  assert.ok(nome.startsWith("AAAA") && nome.length < 160, nome);
  assert.ok(nome.split(" - ")[0].length <= 40, nome);
});

test("nomeArquivoNota: sem pagamento, sem atendimentos ou sem nada, pula só o que falta", () => {
  assert.equal(
    nomeArquivoNota(nota11, "pdf", { ...contextoCompleto, dataPagamento: null }),
    "Marta - Helena - at outubro 2026 - NFSe-1-11.pdf",
  );
  assert.equal(
    nomeArquivoNota(nota11, "pdf", { ...contextoCompleto, datasAtendimento: [] }),
    "Marta - Helena - pg 08-11-2026 - NFSe-1-11.pdf",
  );
  assert.equal(nomeArquivoNota(nota11, "pdf", { responsavel: contextoCompleto.responsavel }), "Marta - NFSe-1-11.pdf");
  assert.equal(
    nomeArquivoNota(nota11, "pdf", { responsavel: null, pacientes: [], dataPagamento: null, datasAtendimento: [] }),
    "NFSe-1-11.pdf",
  );
  assert.equal(nomeArquivoNota(nota11, "pdf", null), "NFSe-1-11.pdf");
});

test("nomeArquivoNota: caracteres proibidos em nome de arquivo somem", () => {
  const ctx = { ...contextoCompleto, responsavel: { nome: 'Ma/rt:a "X"', documento: "1" }, pacientes: ["He*le?na <A>"] };
  const nome = nomeArquivoNota(nota11, "pdf", ctx);
  assert.equal(nome, "Marta - Helena - pg 08-11-2026 at outubro 2026 - NFSe-1-11.pdf");
  assert.ok(!/[<>:"/\\|?*]/.test(nome.replace(/\.pdf$/, "")));
});

test("dataParaArquivo: ISO vira dd-mm-aaaa; inválido vira vazio", () => {
  assert.equal(dataParaArquivo("2026-11-08"), "08-11-2026");
  assert.equal(dataParaArquivo("2026-11-08T03:00:00Z"), "08-11-2026");
  assert.equal(dataParaArquivo("08/11/2026"), "");
  assert.equal(dataParaArquivo(null), "");
});

test("mesesDosAtendimentos: mês e ano por extenso, juntando meses e anos distintos", () => {
  assert.equal(mesesDosAtendimentos(["2026-03-03", "2026-03-24"]), "março 2026");
  assert.equal(mesesDosAtendimentos(["2026-11-03", "2026-10-30", "2026-10-02"]), "outubro e novembro 2026");
  assert.equal(mesesDosAtendimentos(["2026-09-30", "2026-10-02", "2026-11-03"]), "setembro, outubro e novembro 2026");
  assert.equal(mesesDosAtendimentos(["2027-01-05", "2026-12-29"]), "dezembro 2026 e janeiro 2027");
  assert.equal(mesesDosAtendimentos([]), "");
  assert.equal(mesesDosAtendimentos(["lixo", null]), "");
});

test("contextoDoNomeArquivo: nota de cobrança traz pagamento, sessões e pacientes (sem repetir, na ordem das sessões)", () => {
  const nota = {
    tomador_nome: "Marta Alves Souza",
    tomador_documento: "12345678909",
    Cobranca: {
      Recebimento: {
        data_recebimento: "2026-11-08",
        RecebimentoSessao: [
          { Sessao: { data: "2026-10-16", Paciente: { id: 2, nome: "João Pedro Alves" } } },
          { Sessao: { data: "2026-10-02", Paciente: { id: 1, nome: "Helena Prado" } } },
          { Sessao: { data: "2026-10-09", Paciente: { id: 2, nome: "João Pedro Alves" } } },
        ],
      },
    },
    RecebimentoSessao: null,
  };
  assert.deepEqual(contextoDoNomeArquivo(nota), {
    responsavel: { nome: "Marta Alves Souza", documento: "12345678909" },
    pacientes: ["Helena Prado", "João Pedro Alves"],
    dataPagamento: "2026-11-08",
    datasAtendimento: ["2026-10-02", "2026-10-09", "2026-10-16"],
  });
});

test("contextoDoNomeArquivo: nota por sessão e nota sem vínculo", () => {
  const porSessao = {
    tomador_nome: "Helena Prado",
    tomador_documento: null,
    Cobranca: null,
    RecebimentoSessao: {
      Recebimento: { data_recebimento: "2026-11-08" },
      Sessao: { data: "2026-10-02", Paciente: { id: 1, nome: "Helena Prado" } },
    },
  };
  assert.deepEqual(contextoDoNomeArquivo(porSessao), {
    responsavel: { nome: "Helena Prado", documento: null },
    pacientes: ["Helena Prado"],
    dataPagamento: "2026-11-08",
    datasAtendimento: ["2026-10-02"],
  });
  assert.deepEqual(contextoDoNomeArquivo({ id: 1, tomador_nome: "  " }), {
    responsavel: null,
    pacientes: [],
    dataPagamento: null,
    datasAtendimento: [],
  });
  assert.deepEqual(contextoDoNomeArquivo(null), { responsavel: null, pacientes: [], dataPagamento: null, datasAtendimento: [] });
});

test("contentDispositionAnexo: filename ASCII de reserva e filename* em UTF-8", () => {
  assert.equal(
    contentDispositionAnexo("Marta - Helena - pg 08-11-2026 at março 2026 - NFSe-1-11.pdf"),
    'attachment; filename="Marta - Helena - pg 08-11-2026 at marco 2026 - NFSe-1-11.pdf"; ' +
      "filename*=UTF-8''Marta%20-%20Helena%20-%20pg%2008-11-2026%20at%20mar%C3%A7o%202026%20-%20NFSe-1-11.pdf",
  );
  // caractere fora do latin1 não quebra o cabeçalho HTTP
  assert.match(contentDispositionAnexo("Łukasz - NFSe-1-1.pdf"), /^[\x20-\x7e]+$/);
  assert.equal(contentDispositionAnexo("NFSe-1-7.pdf"), `attachment; filename="NFSe-1-7.pdf"; filename*=UTF-8''NFSe-1-7.pdf`);
});

test("nomesUnicos: repetidos ganham (2), (3) antes da extensão", () => {
  assert.deepEqual(nomesUnicos(["a.pdf", "a.pdf", "b.xml", "a.pdf"]), ["a.pdf", "a (2).pdf", "b.xml", "a (3).pdf"]);
  assert.deepEqual(nomesUnicos([]), []);
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
