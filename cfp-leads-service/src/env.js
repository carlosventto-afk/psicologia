// Leitor de env numérica com validação. `Number(process.env.X ?? default)` só
// cai no default quando a variável está ausente: string vazia (X=) vira 0 e
// valor malformado vira NaN. Como o deploy é um formulário manual no
// EasyPanel (um humano digitando), isso é uma falha realista — e silenciosa:
// DELAY_MIN_MS=0 mata o rate limit ("nunca em rajada") e RUN_INTERVAL_HOURS=0
// transforma o loop diário em busy loop. Aqui a gente falha rápido, no boot.
export function numEnv(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${name} inválido: ${JSON.stringify(raw)}`);
  }
  return n;
}
