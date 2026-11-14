import { PARAMETROS } from "./parametros-2026.js";

const arredonda = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Imposto da tabela progressiva sobre `base`, menos o redutor avaliado sobre
// `rendimentoTributavel`. Nunca negativo. Sem arredondamento (uso interno).
function irpfBruto(base, rendimentoTributavel) {
  const { redutor, faixasIrpf } = PARAMETROS;
  if (rendimentoTributavel <= redutor.isencaoAte) return 0;
  const faixa = faixasIrpf.find((f) => base <= f.limite);
  const tabela = Math.max(0, base * faixa.aliquota - faixa.deducao);
  const reducao =
    rendimentoTributavel <= redutor.fimRedutor
      ? Math.max(0, redutor.constante - redutor.fator * rendimentoTributavel)
      : 0;
  return Math.max(0, tabela - reducao);
}

export function irpfMensal({ base, rendimentoTributavel }) {
  return arredonda(irpfBruto(Math.max(0, base), rendimentoTributavel));
}

// PF autonoma (Carnê-Leão). INSS sobre o faturamento limitado a [salario minimo, teto];
// despesas (livro-caixa) reduzem apenas a base do IRPF. Redutor avaliado sobre o faturamento.
export function calcularPessoaFisica({ faturamento, despesas }) {
  const { salarioMinimo, tetoInss, aliquotaInssAutonomo } = PARAMETROS;
  const baseInss =
    faturamento > 0 ? Math.min(Math.max(faturamento, salarioMinimo), tetoInss) : 0;
  const inss = arredonda(baseInss * aliquotaInssAutonomo);
  const base = arredonda(Math.max(0, faturamento - despesas - inss));
  const irpf = irpfMensal({ base, rendimentoTributavel: faturamento });
  const imposto = arredonda(inss + irpf);
  const liquido = arredonda(faturamento - despesas - imposto);
  return { inss, base, irpf, imposto, liquido };
}
