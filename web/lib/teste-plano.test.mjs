import test from "node:test";
import assert from "node:assert/strict";
import {
  podeReceberTeste,
  calcularFimTeste,
  diasRestantes,
  PLANOS_LIBERAVEIS,
  DIAS_AVISO,
} from "./teste-plano.js";

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date("2026-11-05T12:00:00Z");

test("constantes", () => {
  assert.deepEqual(PLANOS_LIBERAVEIS, ["gestao", "gestao_marketing", "marketing"]);
  assert.equal(DIAS_AVISO, 3);
});

test("podeReceberTeste", () => {
  assert.equal(podeReceberTeste({ plano: "gratis", plano_pretendido: null }), true);
  assert.equal(podeReceberTeste({ plano: "gestao", plano_pretendido: null }), false);
  assert.equal(podeReceberTeste({ plano: "gratis", plano_pretendido: "gestao" }), false);
});

test("calcularFimTeste sem fimAtual soma sobre agora", () => {
  assert.equal(calcularFimTeste(agora, 14).getTime(), agora.getTime() + 14 * DIA);
});

test("calcularFimTeste com fimAtual futuro soma sobre ele", () => {
  const fim = new Date(agora.getTime() + 5 * DIA);
  assert.equal(calcularFimTeste(agora, 14, fim).getTime(), fim.getTime() + 14 * DIA);
});

test("calcularFimTeste com fimAtual passado soma sobre agora", () => {
  const fim = new Date(agora.getTime() - 5 * DIA);
  assert.equal(calcularFimTeste(agora, 14, fim).getTime(), agora.getTime() + 14 * DIA);
});

test("diasRestantes", () => {
  assert.equal(diasRestantes(new Date(agora.getTime() + 2.5 * DIA), agora), 3);
  assert.equal(diasRestantes(new Date(agora.getTime() - DIA), agora), 0);
  assert.equal(diasRestantes(new Date(agora.getTime() + 2.5 * DIA).toISOString(), agora), 3);
});
