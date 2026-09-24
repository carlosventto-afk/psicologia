// Leitor de env numérica com validação. `Number(process.env.X ?? default)` só
// cai no default quando a variável está ausente: string vazia (X=) vira 0 e
// valor malformado vira NaN. Como o deploy é um formulário manual no
// EasyPanel, isso é uma falha realista e silenciosa — aqui a gente falha
// rápido, no boot (mesmo padrão do cfp-leads-service).
export function numEnv(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${name} inválido: ${JSON.stringify(raw)}`);
  }
  return n;
}
