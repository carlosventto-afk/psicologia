import test from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS } from "./parametros-2026.js";
import { irpfMensal, calcularPessoaFisica } from "./pessoa-fisica.js";

test("parametros globais", () => {
  assert.equal(PARAMETROS.salarioMinimo, 1621);
  assert.equal(PARAMETROS.tetoInss, 8475.55);
  assert.equal(PARAMETROS.aliquotaInssAutonomo, 0.2);
  assert.equal(PARAMETROS.aliquotaInssProLabore, 0.11);
  assert.equal(PARAMETROS.proLaborePercentual, 0.28);
  assert.equal(PARAMETROS.limiteSimplesAnual, 4800000);
  assert.equal(PARAMETROS.contadorPadrao, 300);
  assert.equal(PARAMETROS.anexoIII.length, 6);
});

test("irpfMensal: zero ate 5.000 de rendimento", () => {
  assert.equal(irpfMensal({ base: 5000, rendimentoTributavel: 5000 }), 0);
  assert.equal(irpfMensal({ base: 0, rendimentoTributavel: 0 }), 0);
});

test("irpfMensal: redutor entre 5.000,01 e 7.350", () => {
  // tabela: 6000*0,275 - 908,73 = 741,27 ; reducao: 978,62 - 0,133145*6000 = 179,75
  assert.equal(irpfMensal({ base: 6000, rendimentoTributavel: 6000 }), 561.52);
});

test("irpfMensal: sem redutor acima de 7.350", () => {
  // 7350,01*0,275 - 908,73 = 1112,52275
  assert.equal(irpfMensal({ base: 7350.01, rendimentoTributavel: 7350.01 }), 1112.52);
});

test("irpfMensal: nunca negativo", () => {
  assert.equal(irpfMensal({ base: 2000, rendimentoTributavel: 6000 }), 0);
  // tabela: 3000*0,15 - 394,16 = 55,84 ; reducao: 978,62 - 0,133145*5500 = 246,3225
  assert.equal(irpfMensal({ base: 3000, rendimentoTributavel: 5500 }), 0);
});

test("calcularPessoaFisica: faturamento alto limita INSS ao teto", () => {
  // inss = 0,2*8475,55 = 1695,11 ; base = 10000-2000-1695,11 = 6304,89
  // irpf = 6304,89*0,275 - 908,73 = 825,11 (sem redutor, fat > 7350)
  const r = calcularPessoaFisica({ faturamento: 10000, despesas: 2000 });
  assert.equal(r.inss, 1695.11);
  assert.equal(r.base, 6304.89);
  assert.equal(r.irpf, 825.11);
  assert.equal(r.imposto, 2520.22);
  assert.equal(r.liquido, 5479.78);
});

test("calcularPessoaFisica: faturamento medio com isencao", () => {
  // inss = 0,2*3000 = 600 ; base = 1900 (isento)
  const r = calcularPessoaFisica({ faturamento: 3000, despesas: 500 });
  assert.deepEqual(r, { inss: 600, base: 1900, irpf: 0, imposto: 600, liquido: 1900 });
});

test("calcularPessoaFisica: redutor avaliado sobre o faturamento", () => {
  // inss 1200 ; base 4800 ; tabela 4800*0,275-908,73 = 411,27 ; reducao 179,75 -> 231,52
  const r = calcularPessoaFisica({ faturamento: 6000, despesas: 0 });
  assert.equal(r.irpf, 231.52);
  assert.equal(r.imposto, 1431.52);
  assert.equal(r.liquido, 4568.48);
});

test("calcularPessoaFisica: piso do salario minimo no INSS", () => {
  // inss = 0,2*1621 = 324,20 ; base = 1000 - 324,20 = 675,80
  const r = calcularPessoaFisica({ faturamento: 1000, despesas: 0 });
  assert.equal(r.inss, 324.2);
  assert.equal(r.base, 675.8);
  assert.equal(r.liquido, 675.8);
});

test("calcularPessoaFisica: despesas maiores que faturamento", () => {
  // inss = 0,2*2000 = 400 ; base 0 ; liquido = 2000-5000-400 = -3400
  const r = calcularPessoaFisica({ faturamento: 2000, despesas: 5000 });
  assert.deepEqual(r, { inss: 400, base: 0, irpf: 0, imposto: 400, liquido: -3400 });
});

test("calcularPessoaFisica: faturamento zero", () => {
  const r = calcularPessoaFisica({ faturamento: 0, despesas: 0 });
  assert.deepEqual(r, { inss: 0, base: 0, irpf: 0, imposto: 0, liquido: 0 });
  assert.ok(!Number.isNaN(calcularPessoaFisica({ faturamento: 0, despesas: 100 }).liquido));
});
