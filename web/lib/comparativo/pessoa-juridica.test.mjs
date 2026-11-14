import test from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS } from "./parametros-2026.js";
import { calcularPessoaJuridica } from "./pessoa-juridica.js";

const pj = (faturamento, despesas = 0, contador = 0) =>
  calcularPessoaJuridica({ faturamento, despesas, contador });

test("limite de dividendos documentado", () => {
  assert.equal(PARAMETROS.limiteDividendosMensal, 50000);
});

test("faixa 1: faturamento 10.000, pro-labore 28%, aliquota efetiva 6%", () => {
  // pro-labore 10000*0,28 = 2800; INSS 2800*0,11 = 308; base IRRF 2492
  // rendimento 2800 <= 5000 -> IRRF 0. RBT12 120.000 (faixa 1): Simples 6% = 600.
  // imposto 600+308+0 = 908; liquido 10000 - 1000 - 908 - 300 = 7792
  const r = pj(10000, 1000, 300);
  assert.equal(r.proLabore, 2800);
  assert.equal(r.inssProLabore, 308);
  assert.equal(r.irrfProLabore, 0);
  assert.equal(r.simples, 600);
  assert.equal(r.contador, 300);
  assert.equal(r.imposto, 908);
  assert.equal(r.liquido, 7792);
  assert.equal(r.avisoDividendos, false);
});

test("limite superior da faixa 1 (RBT12 = 180.000) ainda e 6%", () => {
  // 15000*12 = 180000 -> 6% -> 900
  assert.equal(pj(15000).simples, 900);
});

test("faixa 2: faturamento 20.000, aliquota com parcela a deduzir", () => {
  // RBT12 240000; efetiva = (240000*0,112 - 9360)/240000 = 17520/240000 = 0,073
  // Simples = 20000*0,073 = 1460
  assert.equal(pj(20000).simples, 1460);
});

test("pro-labore abaixo do salario minimo usa o minimo", () => {
  // 5000*0,28 = 1400 < 1621 -> 1621; INSS 1621*0,11 = 178,31
  const r = pj(5000);
  assert.equal(r.proLabore, 1621);
  assert.equal(r.inssProLabore, 178.31);
});

test("INSS do pro-labore limitado ao teto e IRRF na faixa de 27,5%", () => {
  // faturamento 40000 -> pro-labore 11200 > teto 8475,55
  // INSS 8475,55*0,11 = 932,3105 -> 932,31; base IRRF 11200-932,31 = 10267,69
  // rendimento 11200 > 7350 (sem redutor); 10267,69*0,275 - 908,73 = 1914,884875 -> 1914,88
  // RBT12 480000 (faixa 3): (480000*0,135 - 17640)/480000 = 0,09825 -> Simples 3930
  // imposto 3930 + 932,31 + 1914,88 = 6777,19
  const r = pj(40000);
  assert.equal(r.proLabore, 11200);
  assert.equal(r.inssProLabore, 932.31);
  assert.equal(r.irrfProLabore, 1914.88);
  assert.equal(r.simples, 3930);
  assert.equal(r.imposto, 6777.19);
});

test("RBT12 exatamente no limite funciona; acima lanca RangeError", () => {
  // 400000*12 = 4,8 mi: (4800000*0,33 - 648000)/4800000 = 0,195 -> 78000
  assert.equal(pj(400000).simples, 78000);
  assert.throws(() => pj(400001), RangeError);
});

test("avisoDividendos na fronteira de R$ 50.000", () => {
  // faturamento 100000: RBT12 1,2 mi (faixa 4): (1200000*0,16 - 35640)/1200000 = 0,1303
  // Simples 13030; pro-labore 28000; lucro = 100000 - 13030 - 28000 - despesas
  // despesas 8970 -> lucro exatamente 50000 (nao excede) -> false
  assert.equal(pj(100000, 8970).avisoDividendos, false);
  // despesas 8969,99 -> lucro 50000,01 -> true
  assert.equal(pj(100000, 8969.99).avisoDividendos, true);
  // faturamento baixo nunca avisa
  assert.equal(pj(10000).avisoDividendos, false);
});
