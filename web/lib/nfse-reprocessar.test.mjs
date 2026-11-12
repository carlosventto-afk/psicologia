import test from "node:test";
import assert from "node:assert/strict";
import {
  limitePendenteIncerta,
  deveTentarEntrega,
  deveAlertarPendenteIncerta,
  deveAlertarRejeitada,
  entregaEsgotada,
  decidirPosEntrega,
  montarEmailAlerta,
  ASSUNTOS,
} from "./nfse-reprocessar.js";

const agora = new Date("2026-11-12T12:00:00Z");
const atras = (min) => new Date(agora.getTime() - min * 60000).toISOString();

test("pendente: 1h59 não alerta, 2h01 alerta, exatamente 2h alerta", () => {
  assert.equal(deveAlertarPendenteIncerta({ status: "pendente", created_at: atras(119) }, agora), false);
  assert.equal(deveAlertarPendenteIncerta({ status: "pendente", created_at: atras(121) }, agora), true);
  assert.equal(deveAlertarPendenteIncerta({ status: "pendente", created_at: atras(120) }, agora), true);
});

test("pendente já alertada ou de outro status é ignorada", () => {
  assert.equal(
    deveAlertarPendenteIncerta({ status: "pendente", created_at: atras(300), alertada_em: atras(10) }, agora),
    false,
  );
  assert.equal(deveAlertarPendenteIncerta({ status: "autorizada", created_at: atras(300) }, agora), false);
  assert.equal(deveAlertarPendenteIncerta({ status: "pendente", created_at: "x" }, agora), false);
});

test("limitePendenteIncerta devolve agora - 2h", () => {
  assert.equal(limitePendenteIncerta(agora), "2026-11-12T10:00:00.000Z");
});

test("rejeitada: sem ultimo_erro não alerta, com alerta, já alertada não", () => {
  assert.equal(deveAlertarRejeitada({ status: "rejeitada", ultimo_erro: null }), false);
  assert.equal(deveAlertarRejeitada({ status: "rejeitada", ultimo_erro: "  " }), false);
  assert.equal(deveAlertarRejeitada({ status: "rejeitada", ultimo_erro: "CNPJ inválido" }), true);
  assert.equal(deveAlertarRejeitada({ status: "rejeitada", ultimo_erro: "x", alertada_em: atras(5) }), false);
  assert.equal(deveAlertarRejeitada({ status: "pendente", ultimo_erro: "x" }), false);
});

test("entrega: limite de tentativas, ambiente e canais", () => {
  const base = { status: "autorizada", ambiente: "producao", tentativas_entrega: 0, enviada_email_em: null, tomador_email: "a@b.c" };
  assert.equal(deveTentarEntrega(base), true);
  assert.equal(deveTentarEntrega({ ...base, tentativas_entrega: 2 }), true);
  assert.equal(deveTentarEntrega({ ...base, tentativas_entrega: 3 }), false);
  assert.equal(deveTentarEntrega({ ...base, ambiente: "homologacao" }), false);
  assert.equal(deveTentarEntrega({ ...base, status: "pendente" }), false);
  assert.equal(deveTentarEntrega({ ...base, enviada_email_em: atras(1), enviada_whatsapp_em: atras(1) }), false);
  assert.equal(deveTentarEntrega({ ...base, enviada_email_em: atras(1) }), false);
  assert.equal(deveTentarEntrega({ ...base, enviada_email_em: atras(1), tomador_telefone: "11999999999" }), true);
  assert.equal(deveTentarEntrega({ ...base, tomador_email: null }), false);
});

test("entregaEsgotada só na 3a tentativa com falha", () => {
  assert.equal(entregaEsgotada(2, { email: "falhou", whatsapp: "pulado" }), false);
  assert.equal(entregaEsgotada(3, { email: "falhou", whatsapp: "pulado" }), true);
  assert.equal(entregaEsgotada(3, { email: "enviado", whatsapp: "falhou" }), true);
  assert.equal(entregaEsgotada(3, { email: "enviado", whatsapp: "pulado" }), false);
});

test("assuntos exatos", () => {
  assert.equal(ASSUNTOS.incerta, "NFS-e com resultado incerto — confirme no portal antes de emitir de novo");
  assert.equal(ASSUNTOS.rejeitada, "NFS-e rejeitada — corrija e emita manualmente");
  assert.equal(ASSUNTOS.entrega, "NFS-e emitida, mas não foi entregue ao paciente");
  assert.equal(montarEmailAlerta({ tipo: "incerta", nota: {} }).subject, ASSUNTOS.incerta);
});

test("corpo escapa HTML e inclui o motivo", () => {
  const { html } = montarEmailAlerta({
    tipo: "rejeitada",
    nota: { tomador_nome: "<b>Ana</b>", ultimo_erro: "erro <script>x</script> & mais" },
    nomeProfissional: "Dr. <i>X</i>",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>Ana"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt; &amp; mais"));
  assert.ok(html.includes("Dr. &lt;i&gt;X&lt;/i&gt;"));
});

test("tipo desconhecido lança", () => {
  assert.throws(() => montarEmailAlerta({ tipo: "zzz", nota: {} }));
});

test("decidirPosEntrega: só conta quando tentou algum canal", () => {
  const d = decidirPosEntrega(1, { email: "enviado", whatsapp: "pulado" });
  assert.deepEqual(d, { tentou: true, novaContagem: 2, encerradaEmSilencio: false, esgotada: false });
  assert.equal(decidirPosEntrega(0, { email: "pulado", whatsapp: "falhou" }).novaContagem, 1);
});

test("decidirPosEntrega: pulado/pulado encerra em silêncio, sem esgotar", () => {
  const d = decidirPosEntrega(0, { email: "pulado", whatsapp: "pulado" });
  assert.deepEqual(d, { tentou: false, novaContagem: 3, encerradaEmSilencio: true, esgotada: false });
});

test("decidirPosEntrega: esgota só na 3a tentativa com falha", () => {
  assert.equal(decidirPosEntrega(1, { email: "falhou", whatsapp: "pulado" }).esgotada, false);
  assert.equal(decidirPosEntrega(2, { email: "falhou", whatsapp: "pulado" }).esgotada, true);
  assert.equal(decidirPosEntrega(2, { email: "enviado", whatsapp: "pulado" }).esgotada, false);
});

test("alerta uma única vez: alertada_em preenchido bloqueia todas as categorias", () => {
  const a = atras(1);
  assert.equal(deveAlertarPendenteIncerta({ status: "pendente", created_at: atras(500), alertada_em: a }, agora), false);
  assert.equal(deveAlertarRejeitada({ status: "rejeitada", ultimo_erro: "x", alertada_em: a }), false);
});
