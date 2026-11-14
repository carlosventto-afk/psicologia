// Parametros fiscais usados pelo comparativo Carnê-Leão x Simples Nacional.
// Valores de referencia 2026; revisar a cada virada de ano.

export const PARAMETROS = {
  // Salario minimo nacional, vigencia 2026 (Decreto do salario minimo 2026).
  salarioMinimo: 1621,

  // Teto do salario de contribuicao do INSS, vigencia 2026 (Portaria MPS/MF).
  tetoInss: 8475.55,

  // Tabela progressiva mensal do IRPF, vigencia 2025-2026.
  // Fonte: Receita Federal (gov.br/receitafederal, tabela IRPF mensal).
  // `limite` e o teto da faixa (inclusive); imposto = base * aliquota - deducao.
  faixasIrpf: [
    { limite: 2428.8, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
  ],

  // Redutor da Lei 15.270/2025 (vigencia 2026).
  // Rendimento <= isencaoAte: imposto zero.
  // isencaoAte < rendimento <= fimRedutor: reducao = constante - fator * rendimento.
  // Acima de fimRedutor: sem redutor.
  // HIPOTESE: o limite e avaliado sobre o rendimento tributavel bruto (para a PF,
  // o faturamento), nao sobre a base liquida. Leitura conservadora (maior imposto).
  redutor: { isencaoAte: 5000, fimRedutor: 7350, constante: 978.62, fator: 0.133145 },

  // Simples Nacional, Anexo III (servicos), LC 123/2006 com redacao da LC 155/2016.
  // `limite` e o teto da faixa de RBT12; aliquota efetiva = (RBT12 * aliquota - parcela) / RBT12.
  anexoIII: [
    { limite: 180000, aliquota: 0.06, parcela: 0 },
    { limite: 360000, aliquota: 0.112, parcela: 9360 },
    { limite: 720000, aliquota: 0.135, parcela: 17640 },
    { limite: 1800000, aliquota: 0.16, parcela: 35640 },
    { limite: 3600000, aliquota: 0.21, parcela: 125640 },
    { limite: 4800000, aliquota: 0.33, parcela: 648000 },
  ],

  // Sublimite de receita bruta anual do Simples Nacional (LC 123/2006, art. 3).
  limiteSimplesAnual: 4800000,

  // Pro-labore como fracao do faturamento (Fator R: folha >= 28% da receita -> Anexo III).
  proLaborePercentual: 0.28,

  // INSS do contribuinte individual / autonomo (plano normal, 20%).
  aliquotaInssAutonomo: 0.2,

  // INSS do socio sobre pro-labore (11%).
  aliquotaInssProLabore: 0.11,

  // Honorario mensal padrao do contador (premissa editavel, em reais).
  contadorPadrao: 300,

  // Retencao de IR sobre dividendos (Lei 15.270/2025): incide quando a distribuicao
  // mensal por beneficiario excede este valor (em reais).
  limiteDividendosMensal: 50000,
};
