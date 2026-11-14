import test from "node:test";
import assert from "node:assert/strict";
import { compararCenarios, classificarMelhor } from "./comparar.js";
import { calcularPessoaFisica } from "./pessoa-fisica.js";
import { calcularPessoaJuridica } from "./pessoa-juridica.js";

const dp = { aluguel: 500, supervisao: 200, contas: 100, material: 50, outros: 150 }; // soma 1000

test("faturamento invalido retorna ok:false com mensagem", () => {
  for (const faturamento of [0, -100, NaN, Infinity, undefined, null, "", "abc"]) {
    const r = compararCenarios({ faturamento, despesasPorCategoria: dp });
    assert.equal(r.ok, false, String(faturamento));
    assert.equal(typeof r.erro, "string");
    assert.ok(r.erro.length > 0);
  }
});

test("despesa invalida ou negativa retorna ok:false", () => {
  assert.equal(compararCenarios({ faturamento: 10000, despesasPorCategoria: { aluguel: -1 } }).ok, false);
  assert.equal(compararCenarios({ faturamento: 10000, despesasPorCategoria: { aluguel: NaN } }).ok, false);
  assert.equal(compararCenarios({ faturamento: 10000, despesasPorCategoria: { material: "x" } }).ok, false);
});

test("contador invalido retorna ok:false", () => {
  assert.equal(compararCenarios({ faturamento: 10000, despesasPorCategoria: dp, contador: -5 }).ok, false);
  assert.equal(compararCenarios({ faturamento: 10000, despesasPorCategoria: dp, contador: NaN }).ok, false);
});

test("contador omitido usa 300 e despesas sao somadas", () => {
  const r = compararCenarios({ faturamento: 10000, despesasPorCategoria: dp });
  assert.equal(r.ok, true);
  assert.equal(r.pj.contador, 300);
  // PJ a mao (ver pessoa-juridica.test): imposto 908; liquido 10000 - 1000 - 908 - 300 = 7792
  assert.equal(r.pj.liquido, 7792);
  assert.deepEqual(r.pf, calcularPessoaFisica({ faturamento: 10000, despesas: 1000 }));
});

test("contador informado e respeitado; categorias ausentes valem zero", () => {
  const r = compararCenarios({ faturamento: 10000, despesasPorCategoria: { aluguel: 1000 }, contador: 500 });
  assert.equal(r.ok, true);
  assert.equal(r.pj.contador, 500);
  assert.deepEqual(r.pj, calcularPessoaJuridica({ faturamento: 10000, despesas: 1000, contador: 500 }));
});

test("melhor e economia coerentes com os liquidos", () => {
  const r = compararCenarios({ faturamento: 10000, despesasPorCategoria: dp });
  const dif = Math.round((r.pj.liquido - r.pf.liquido) * 100) / 100;
  assert.equal(r.melhor, Math.abs(dif) < 100 ? "empate" : dif > 0 ? "pj" : "pf");
  assert.equal(r.economiaMensal, Math.abs(dif));
  assert.equal(r.economiaAnual, Math.round(r.economiaMensal * 12 * 100) / 100);
});

test("PJ vence com faturamento alto e PF vence com faturamento baixo", () => {
  // Faturamento 30000: PF paga INSS 1695,11 + IRPF na faixa de 27,5% sobre ~28 mil;
  // PJ paga Simples ~9%-10% + pro-labore; PJ deve compensar mesmo com contador.
  assert.equal(compararCenarios({ faturamento: 30000, despesasPorCategoria: {} }).melhor, "pj");
  // Faturamento 3000: PF isenta de IRPF (rendimento <= 5000) e INSS 600; PJ paga Simples 180
  // + INSS do minimo 178,31 + contador 300 = 658,31 > 600.
  assert.equal(compararCenarios({ faturamento: 3000, despesasPorCategoria: {} }).melhor, "pf");
});

test("faturamento fora do Simples retorna ok:false citando o Simples", () => {
  const r = compararCenarios({ faturamento: 500000, despesasPorCategoria: dp });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Simples/);
});

test("classificarMelhor: tolerancia max(50, 1% do faturamento)", () => {
  // faturamento 3000: 1% = 30 -> tolerancia 50
  assert.equal(classificarMelhor(49.99, 3000), "empate");
  assert.equal(classificarMelhor(-49.99, 3000), "empate");
  assert.equal(classificarMelhor(50, 3000), "pj");
  assert.equal(classificarMelhor(-50.01, 3000), "pf");
  // faturamento 10000: 1% = 100 -> tolerancia 100
  assert.equal(classificarMelhor(99.99, 10000), "empate");
  assert.equal(classificarMelhor(100.01, 10000), "pj");
  assert.equal(classificarMelhor(-100.01, 10000), "pf");
  assert.equal(classificarMelhor(0, 10000), "empate");
});

test("compararCenarios: empate mantem a diferenca real em economia", () => {
  const r = compararCenarios({ faturamento: 10000, despesasPorCategoria: dp });
  const dif = Math.round((r.pj.liquido - r.pf.liquido) * 100) / 100;
  assert.equal(r.melhor, Math.abs(dif) < 100 ? "empate" : dif > 0 ? "pj" : "pf");
  assert.equal(r.economiaMensal, Math.abs(dif));
});
