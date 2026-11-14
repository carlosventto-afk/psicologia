import { PARAMETROS } from "./parametros-2026.js";
import { calcularPessoaFisica } from "./pessoa-fisica.js";
import { calcularPessoaJuridica } from "./pessoa-juridica.js";

const arredonda = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const numeroValido = (v) => typeof v === "number" && Number.isFinite(v);
const CATEGORIAS = ["aluguel", "supervisao", "contas", "material", "outros"];

// Diferença menor que max(R$ 50, 1% do faturamento) conta como empate.
export function classificarMelhor(diferenca, faturamento) {
  const tolerancia = Math.max(50, faturamento * 0.01);
  if (Math.abs(diferenca) < tolerancia) return "empate";
  return diferenca > 0 ? "pj" : "pf";
}

export function compararCenarios({ faturamento, despesasPorCategoria, contador } = {}) {
  if (!numeroValido(faturamento) || faturamento <= 0) {
    return { ok: false, erro: "Informe um faturamento mensal maior que zero." };
  }
  let despesas = 0;
  for (const categoria of CATEGORIAS) {
    const v = despesasPorCategoria?.[categoria] ?? 0;
    if (!numeroValido(v) || v < 0) {
      return { ok: false, erro: `Informe um valor válido (zero ou maior) para a despesa "${categoria}".` };
    }
    despesas += v;
  }
  const honorario = contador ?? PARAMETROS.contadorPadrao;
  if (!numeroValido(honorario) || honorario < 0) {
    return { ok: false, erro: "Informe um valor válido (zero ou maior) para o contador." };
  }

  const pf = calcularPessoaFisica({ faturamento, despesas });
  let pj;
  try {
    pj = calcularPessoaJuridica({ faturamento, despesas, contador: honorario });
  } catch (e) {
    if (e instanceof RangeError) {
      return {
        ok: false,
        erro: "Faturamento acima do limite do Simples Nacional (R$ 4,8 milhões por ano); o comparativo não se aplica.",
      };
    }
    throw e;
  }

  const diferenca = arredonda(pj.liquido - pf.liquido);
  const melhor = classificarMelhor(diferenca, faturamento);
  const economiaMensal = Math.abs(diferenca);
  return { ok: true, pf, pj, melhor, economiaMensal, economiaAnual: arredonda(economiaMensal * 12) };
}
