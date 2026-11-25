import test from "node:test";
import assert from "node:assert/strict";
import { gerarPdfsDasNotas, LOTE_MAX_PDFS } from "./nfse-pdf.js";

const nota = (id, xml = `<NFSe n="${id}"/>`, ambiente = "producao") => ({ id, ambiente, xml_nfse: xml });
const b64 = (txt) => Buffer.from(txt).toString("base64");

// Silencia o console.error esperado nos testes de falha.
async function semLog(fn) {
  const original = console.error;
  const linhas = [];
  console.error = (...a) => linhas.push(a.join(" "));
  try {
    return { resultado: await fn(), linhas };
  } finally {
    console.error = original;
  }
}

test("envia só as notas com XML, em base64, e devolve os PDFs pelo id", async () => {
  const chamadas = [];
  const chamar = async (caminho, corpo, opcoes) => {
    chamadas.push({ caminho, corpo, opcoes });
    return { resultados: corpo.notas.map((n) => ({ id: n.id, pdf_base64: b64(`PDF-${n.id}`) })) };
  };
  const geradas = await gerarPdfsDasNotas([nota(34), nota(35, null), nota(36, "   "), nota(37, "<x>ç</x>", "homologacao")], chamar);

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].caminho, "/danfse");
  assert.deepEqual(
    chamadas[0].corpo.notas.map((n) => [n.id, n.ambiente]),
    [["34", "producao"], ["37", "homologacao"]],
  );
  assert.equal(Buffer.from(chamadas[0].corpo.notas[1].xml_nfse_base64, "base64").toString("utf-8"), "<x>ç</x>");
  assert.ok(chamadas[0].opcoes.timeoutMs > 0, "deve limitar o tempo de espera");
  assert.deepEqual([...geradas.keys()].sort(), ["34", "37"]);
  assert.equal(geradas.get("34").toString(), "PDF-34");
});

test("não chama o serviço quando nenhuma nota tem XML", async () => {
  let chamou = false;
  const geradas = await gerarPdfsDasNotas([nota(1, null), nota(2, "")], async () => {
    chamou = true;
    return { resultados: [] };
  });
  assert.equal(chamou, false);
  assert.equal(geradas.size, 0);
  assert.equal((await gerarPdfsDasNotas(undefined, async () => ({}))).size, 0);
});

test("nota que o serviço não conseguiu desenhar fica fora do mapa", async () => {
  const chamar = async () => ({
    resultados: [
      { id: "1", pdf_base64: b64("PDF-1") },
      { id: "2", pdf_base64: null },
      null,
    ],
  });
  const geradas = await gerarPdfsDasNotas([nota(1), nota(2), nota(3)], chamar);
  assert.deepEqual([...geradas.keys()], ["1"]);
});

test("serviço fora do ar, lento ou não configurado: não lança e devolve mapa vazio", async () => {
  for (const erro of [new Error("Servico de NFS-e respondeu 503."), Object.assign(new Error("timeout"), { name: "TimeoutError" }), Object.assign(new Error("nao configurado"), { naoEnviada: true })]) {
    const { resultado, linhas } = await semLog(() => gerarPdfsDasNotas([nota(1)], async () => { throw erro; }));
    assert.equal(resultado.size, 0);
    assert.equal(linhas.length, 1);
    assert.match(linhas[0], /não desenhou o PDF de 1 nota/);
  }
});

test("resposta sem 'resultados' não quebra", async () => {
  assert.equal((await gerarPdfsDasNotas([nota(1)], async () => null)).size, 0);
  assert.equal((await gerarPdfsDasNotas([nota(1)], async () => ({}))).size, 0);
});

test(`divide em lotes de ${LOTE_MAX_PDFS} e uma falha de lote não perde os outros`, async () => {
  const notas = Array.from({ length: LOTE_MAX_PDFS * 2 + 5 }, (_, i) => nota(i + 1));
  const tamanhos = [];
  const chamar = async (_c, corpo) => {
    tamanhos.push(corpo.notas.length);
    if (tamanhos.length === 2) throw new Error("falha no lote do meio");
    return { resultados: corpo.notas.map((n) => ({ id: n.id, pdf_base64: b64("P") })) };
  };
  const { resultado } = await semLog(() => gerarPdfsDasNotas(notas, chamar));
  assert.deepEqual(tamanhos, [LOTE_MAX_PDFS, LOTE_MAX_PDFS, 5]);
  assert.equal(resultado.size, LOTE_MAX_PDFS + 5);
  assert.ok(resultado.has("1") && !resultado.has(String(LOTE_MAX_PDFS + 1)) && resultado.has(String(LOTE_MAX_PDFS * 2 + 5)));
});
