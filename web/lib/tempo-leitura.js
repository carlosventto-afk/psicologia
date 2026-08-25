export function calcularTempoLeitura(texto) {
  if (!texto) return 1;
  const palavras = texto.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(palavras / 200));
}
