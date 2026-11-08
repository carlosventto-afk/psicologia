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
  sessaoRealizada,
  sessoesMarcadasPorPadrao,
  totalSelecionado,
  pacientesParaEnviar,
  mesAnterior,
  mesDoParametro,
  valorMes,
  rotuloMes,
  hojeSaoPaulo,
  textoBloqueioCobranca,
  mensagemBloqueioOu,
  primeiraCobrancaAberta,
  mensagemSessaoEmCobranca,
} from "./cobranca.js";

test("textoBloqueioCobranca remove o prefixo ou devolve null", () => {
  assert.equal(textoBloqueioCobranca({ message: "COBRANCA: na cobrança #3." }), "Na cobrança #3.");
  assert.equal(textoBloqueioCobranca({ message: "duplicate key" }), null);
  assert.equal(textoBloqueioCobranca(null), null);
});

test("mensagemBloqueioOu usa o bloqueio ou a mensagem generica", () => {
  assert.equal(mensagemBloqueioOu({ message: "COBRANCA: x" }, "generica"), "X");
  assert.equal(mensagemBloqueioOu({ message: "boom" }, "generica"), "generica");
});

test("primeiraCobrancaAberta so considera vinculo ativo em cobranca aberta", () => {
  assert.equal(primeiraCobrancaAberta(null), null);
  assert.equal(primeiraCobrancaAberta([]), null);
  assert.equal(primeiraCobrancaAberta([{ ativa: false, Cobranca: { id: 1, situacao: "aberta" } }]), null);
  assert.equal(primeiraCobrancaAberta([{ ativa: true, Cobranca: { id: 2, situacao: "recebida" } }]), null);
  assert.equal(primeiraCobrancaAberta([{ ativa: true, Cobranca: null }]), null);
  assert.equal(
    primeiraCobrancaAberta([
      { ativa: true, Cobranca: { id: 2, situacao: "cancelada" } },
      { ativa: true, Cobranca: { id: 7, situacao: "aberta" } },
      { ativa: true, Cobranca: { id: 9, situacao: "aberta" } },
    ]),
    7
  );
  assert.equal(primeiraCobrancaAberta([{ ativa: true, Cobranca: [{ id: 4, situacao: "aberta" }] }]), 4);
});

test("mensagemSessaoEmCobranca cita a cobranca", () => {
  assert.equal(mensagemSessaoEmCobranca(5), "A sessão está na cobrança #5 (aberta). Receba pela cobrança.");
});

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
  assert.equal(mensagemErroCobranca({ message: "COBRANCA: cobrança não encontrada." }), "Cobrança não encontrada.");
  assert.equal(
    mensagemErroCobranca({ code: "23505", message: "duplicate key" }),
    "Algumas dessas sessões já foram incluídas em outra cobrança."
  );
  assert.match(mensagemErroCobranca({ message: "boom" }), /Não foi possível/);
  assert.match(mensagemErroCobranca(null), /Não foi possível/);
});

test("sessaoRealizada e marcadas por padrao", () => {
  assert.equal(sessaoRealizada({ status: "Realizada" }), true);
  assert.equal(sessaoRealizada({ status: "realizada" }), true);
  assert.equal(sessaoRealizada({ status: "Marcada", Realizado: true }), true);
  assert.equal(sessaoRealizada({ status: "Marcada" }), false);
  assert.deepEqual(
    sessoesMarcadasPorPadrao([{ id: 1, realizada: true }, { id: 2, realizada: false }, { id: 3, realizada: true }]),
    [1, 3]
  );
});

test("agrupar expoe detalhe das sessoes", () => {
  const r = agruparPendenciasPorPaciente([
    { id: 1, status: "Realizada", valor: 80, data: "2026-10-01", horario: "10:00", paciente: { id: 1, nome: "Ana" } },
    { id: 2, status: null, valor: 80, data: "2026-10-08", horario: "10:00", paciente: { id: 1, nome: "Ana" } },
  ]);
  assert.equal(r[0].sessoes[0].realizada, true);
  assert.equal(r[0].sessoes[1].realizada, false);
  assert.equal(r[0].sessoes[1].status, "Marcada");
  assert.equal(r[0].sessoes[0].saldo, 80);
});

test("totalSelecionado soma so as marcadas", () => {
  const ss = [{ id: 1, saldo: 80.1 }, { id: 2, saldo: 0.2 }, { id: 3, saldo: 50 }];
  assert.equal(totalSelecionado(ss, [1, 2]), 80.3);
  assert.equal(totalSelecionado(ss, []), 0);
  assert.equal(totalSelecionado(null, null), 0);
});

test("pacientesParaEnviar exclui marcados sem sessoes", () => {
  assert.deepEqual(pacientesParaEnviar([1, 2, 3], { 1: [10], 2: [], 3: [5, 6] }), [1, 3]);
  assert.deepEqual(pacientesParaEnviar([4], {}), []);
});

test("mes: anterior, validacao do parametro, valor e rotulo", () => {
  assert.deepEqual(mesAnterior(new Date("2026-11-07T15:00:00Z")), { ano: 2026, mes: 10 });
  assert.deepEqual(mesAnterior(new Date("2026-01-15T12:00:00Z")), { ano: 2025, mes: 12 });
  const hoje = new Date("2026-11-07T15:00:00Z");
  assert.deepEqual(mesDoParametro("2026-03", hoje), { ano: 2026, mes: 3 });
  for (const ruim of ["2026-13", "2026-00", "2026-3", "abc", "", null, undefined, "2026-03-01", "1999-05", ["2026-03"]]) {
    assert.deepEqual(mesDoParametro(ruim, hoje), { ano: 2026, mes: 10 }, String(ruim));
  }
  assert.equal(valorMes({ ano: 2026, mes: 3 }), "2026-03");
  assert.equal(rotuloMes({ ano: 2026, mes: 3 }), "Março/2026");
});

test("mesAnterior usa America/Sao_Paulo", () => {
  assert.deepEqual(mesAnterior(new Date("2026-12-01T01:00:00Z")), { ano: 2026, mes: 10 });
  assert.deepEqual(mesAnterior(new Date("2026-01-15T12:00:00Z")), { ano: 2025, mes: 12 });
});

test("hojeSaoPaulo usa America/Sao_Paulo", () => {
  assert.equal(hojeSaoPaulo(new Date("2026-12-01T01:00:00Z")), "2026-11-30");
  assert.equal(hojeSaoPaulo(new Date("2026-12-01T12:00:00Z")), "2026-12-01");
});
