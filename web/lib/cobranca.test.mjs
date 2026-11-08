import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saldoSessao,
  sessaoElegivel,
  totalCobranca,
  tipoDocumentoDoPaciente,
  intervaloDoMes,
} from "./cobranca.js";

test("saldoSessao desconta pagamento parcial", () => {
  assert.equal(saldoSessao({ valor: 150, RecebimentoSessao: [{ valor_aplicado: 50 }] }), 100);
});

test("saldoSessao sem recebimentos e com valor nulo", () => {
  assert.equal(saldoSessao({ valor: 150 }), 150);
  assert.equal(saldoSessao({ valor: null }), 0);
  assert.equal(saldoSessao({ valor: "150.50", RecebimentoSessao: [{ valor_aplicado: "0.50" }] }), 150);
});

test("saldoSessao nunca fica negativo e evita erro de ponto flutuante", () => {
  assert.equal(saldoSessao({ valor: 100, RecebimentoSessao: [{ valor_aplicado: 120 }] }), 0);
  assert.equal(saldoSessao({ valor: 0.3, RecebimentoSessao: [{ valor_aplicado: 0.1 }] }), 0.2);
});

test("sessaoElegivel: sessao normal com saldo", () => {
  assert.equal(sessaoElegivel({ status: "Realizada", valor: 150 }), true);
  assert.equal(sessaoElegivel({ status: null, valor: 150 }), true);
});

test("sessaoElegivel: Cancelada e inelegivel", () => {
  assert.equal(sessaoElegivel({ status: "Cancelada", valor: 150 }), false);
});

test("sessaoElegivel: saldo zero e inelegivel", () => {
  assert.equal(
    sessaoElegivel({ status: "Realizada", valor: 150, RecebimentoSessao: [{ valor_aplicado: 150 }] }),
    false
  );
});

test("sessaoElegivel: em cobranca ativa e inelegivel", () => {
  assert.equal(sessaoElegivel({ status: "Realizada", valor: 150, emCobrancaAtiva: true }), false);
});

test("totalCobranca soma os saldos", () => {
  assert.equal(
    totalCobranca([
      { valor: 150, RecebimentoSessao: [{ valor_aplicado: 50 }] },
      { valor: 100 },
      { valor: 0.1 },
      { valor: 0.2 },
    ]),
    200.3
  );
  assert.equal(totalCobranca([]), 0);
});

test("tipoDocumentoDoPaciente", () => {
  assert.equal(tipoDocumentoDoPaciente("Receita Saúde"), "recibo");
  assert.equal(tipoDocumentoDoPaciente("recibo"), "recibo");
  assert.equal(tipoDocumentoDoPaciente("nota_fiscal"), "nota_fiscal");
  assert.equal(tipoDocumentoDoPaciente("Nota Fiscal"), "nota_fiscal");
  assert.equal(tipoDocumentoDoPaciente(null), "nenhum");
  assert.equal(tipoDocumentoDoPaciente(""), "nenhum");
  assert.equal(tipoDocumentoDoPaciente("Nenhum"), "nenhum");
  assert.equal(tipoDocumentoDoPaciente("qualquer coisa"), "nenhum");
});

test("intervaloDoMes", () => {
  assert.deepEqual(intervaloDoMes(2026, 2), { inicio: "2026-02-01", fim: "2026-03-01" });
  assert.deepEqual(intervaloDoMes(2026, 12), { inicio: "2026-12-01", fim: "2027-01-01" });
  assert.deepEqual(intervaloDoMes(2026, 1), { inicio: "2026-01-01", fim: "2026-02-01" });
});
