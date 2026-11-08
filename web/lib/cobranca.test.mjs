import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saldoSessao,
  sessaoElegivel,
  totalCobranca,
  tipoDocumentoDoPaciente,
  intervaloDoMes,
  agruparPendenciasPorPaciente,
  escolherResponsavel,
  mensagemErroCobranca,
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

test("sessaoElegivel: 'cancelada' em minusculas (agente WhatsApp) e inelegivel", () => {
  assert.equal(sessaoElegivel({ status: "cancelada", valor: 150 }), false);
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

test("intervaloDoMes aceita strings", () => {
  assert.deepEqual(intervaloDoMes("2026", "12"), { inicio: "2026-12-01", fim: "2027-01-01" });
});

test("agruparPendenciasPorPaciente agrupa, soma saldo e ignora inelegiveis", () => {
  const joao = { id: 1, nome: "Joao", documento: "recibo" };
  const ana = { id: 2, nome: "Ana", documento: null };
  const sessoes = [
    { id: 10, valor: 100, paciente: joao, RecebimentoSessao: [{ valor_aplicado: 40 }] },
    { id: 11, valor: 100, paciente: joao },
    { id: 12, valor: 100, paciente: joao, status: "Cancelada" },
    { id: 13, valor: 100, paciente: joao, emCobrancaAtiva: true },
    { id: 14, valor: 80, paciente: ana },
    { id: 15, valor: 50, paciente: ana, RecebimentoSessao: [{ valor_aplicado: 50 }] },
  ];
  const r = agruparPendenciasPorPaciente(sessoes);
  assert.equal(r.length, 2);
  assert.equal(r[0].paciente.nome, "Ana");
  assert.equal(r[0].qtdSessoes, 1);
  assert.equal(r[0].total, 80);
  assert.equal(r[0].tipoDocumentoPadrao, "nenhum");
  assert.equal(r[1].qtdSessoes, 2);
  assert.equal(r[1].total, 160);
  assert.equal(r[1].tipoDocumentoPadrao, "recibo");
  assert.deepEqual(r[1].sessaoIds, [10, 11]);
});

test("escolherResponsavel: nenhum, unico e varios", () => {
  assert.ok(escolherResponsavel([], null).error);
  assert.deepEqual(escolherResponsavel([{ id: 5 }], null), { id: 5 });
  assert.deepEqual(escolherResponsavel([{ id: 5 }], 99), { id: 5 });
  assert.ok(escolherResponsavel([{ id: 5 }, { id: 6 }], null).error);
  assert.ok(escolherResponsavel([{ id: 5 }, { id: 6 }], 7).error);
  assert.deepEqual(escolherResponsavel([{ id: 5 }, { id: 6 }], "6"), { id: 6 });
});

test("mensagemErroCobranca traduz erros", () => {
  assert.equal(mensagemErroCobranca({ message: "COBRANCA: cobrança não encontrada." }), "cobrança não encontrada.");
  assert.equal(
    mensagemErroCobranca({ code: "23505", message: "duplicate key" }),
    "Algumas dessas sessões já foram incluídas em outra cobrança."
  );
  assert.match(mensagemErroCobranca({ message: "boom" }), /Não foi possível/);
  assert.match(mensagemErroCobranca(null), /Não foi possível/);
});
