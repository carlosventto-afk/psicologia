// Logica pura de Cobranca (sem acesso a banco): saldo, elegibilidade, total,
// mapeamento de documento e intervalo do mes. As regras valem tambem no banco
// (funcoes criar_cobranca / receber_cobranca); aqui servem a tela.
// Dinheiro e somado em centavos inteiros pra evitar erro de ponto flutuante.

const paraCentavos = (v) => Math.round(Number(v ?? 0) * 100) || 0;

function saldoEmCentavos(sessao) {
  const aplicado = (sessao?.RecebimentoSessao ?? []).reduce(
    (soma, r) => soma + paraCentavos(r.valor_aplicado),
    0
  );
  return Math.max(0, paraCentavos(sessao?.valor) - aplicado);
}

export function saldoSessao(sessao) {
  return saldoEmCentavos(sessao) / 100;
}

export function sessaoElegivel(sessao) {
  if (sessao?.status === "Cancelada") return false;
  if (sessao?.emCobrancaAtiva) return false;
  return saldoEmCentavos(sessao) > 0;
}

export function totalCobranca(sessoes) {
  return (sessoes ?? []).reduce((soma, s) => soma + saldoEmCentavos(s), 0) / 100;
}

// Valores reais da coluna Paciente.documento: 'recibo', 'nota_fiscal' ou null.
// Tambem aceita os rotulos da tela ("Receita Saúde", "Nota Fiscal", "Nenhum").
export function tipoDocumentoDoPaciente(documento) {
  const d = String(documento ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (d === "recibo" || d === "receita saude") return "recibo";
  if (d === "nota_fiscal" || d === "nota fiscal") return "nota_fiscal";
  return "nenhum";
}

// mes de 1 a 12; fim exclusivo (primeiro dia do mes seguinte).
export function intervaloDoMes(ano, mes) {
  const fmt = (a, m) => `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const inicio = fmt(ano, mes);
  const fim = mes === 12 ? fmt(ano + 1, 1) : fmt(ano, mes + 1);
  return { inicio, fim };
}
