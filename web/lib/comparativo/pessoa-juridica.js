import { PARAMETROS } from "./parametros-2026.js";
import { irpfMensal } from "./pessoa-fisica.js";

const arredonda = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Simples Nacional Anexo III mensal: faturamento * (RBT12 * aliq - PD) / RBT12,
// que equivale a (RBT12 * aliq - PD) / 12 com RBT12 = faturamento * 12.
function simplesMensal(faturamento) {
  const rbt12 = faturamento * 12;
  if (rbt12 > PARAMETROS.limiteSimplesAnual) {
    throw new RangeError("Receita bruta anual acima do limite do Simples Nacional");
  }
  const faixa = PARAMETROS.anexoIII.find((f) => rbt12 <= f.limite);
  return arredonda((rbt12 * faixa.aliquota - faixa.parcela) / 12);
}

// PJ no Simples Nacional (Anexo III via Fator R). Socio recebe pro-labore de 28% do
// faturamento (minimo 1 salario minimo); o restante do lucro sai como dividendos isentos.
export function calcularPessoaJuridica({ faturamento, despesas, contador }) {
  const { salarioMinimo, tetoInss, proLaborePercentual, aliquotaInssProLabore } = PARAMETROS;
  const proLabore = arredonda(Math.max(faturamento * proLaborePercentual, salarioMinimo));
  const inssProLabore = arredonda(Math.min(proLabore, tetoInss) * aliquotaInssProLabore);
  const irrfProLabore = irpfMensal({
    base: proLabore - inssProLabore,
    rendimentoTributavel: proLabore,
  });
  const simples = simplesMensal(faturamento);
  const imposto = arredonda(simples + inssProLabore + irrfProLabore);
  const liquido = arredonda(faturamento - despesas - imposto - contador);
  const dividendos = faturamento - despesas - simples - contador - proLabore;
  const avisoDividendos = arredonda(dividendos) > PARAMETROS.limiteDividendosMensal;
  return { proLabore, inssProLabore, irrfProLabore, simples, contador, imposto, liquido, avisoDividendos };
}
