export function formatarMoeda(valor) {
  const numero = Number(valor) || 0;
  return `R$ ${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
