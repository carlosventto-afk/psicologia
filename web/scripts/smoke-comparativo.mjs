// Smoke test de /comparativo no navegador (375px). Rodar com o preview standalone
// já no ar:  BASE=http://127.0.0.1:3100 node scripts/smoke-comparativo.mjs
// Cria Leads de teste (origem 'comparativo') e apaga ao final. Requer .env.local
// carregado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = process.env.OUT ?? "./.smoke";
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const inicio = new Date().toISOString();
const sufixo = String(Date.now()).slice(-6);
let n = 0;
const relatorio = [];
const ok = (nome, cond, detalhe = "") => {
  relatorio.push({ nome, ok: Boolean(cond), detalhe });
  console.log(`${cond ? "PASS" : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

async function preencher(page, { faturamento, despesas = {}, contador, site }) {
  await page.goto(`${BASE}/comparativo`);
  await page.fill("#faturamento", faturamento);
  for (const [k, v] of Object.entries(despesas)) await page.fill(`#d-${k}`, v);
  if (contador !== undefined) await page.fill("#contador", contador);
  await page.click('button:has-text("Ver comparativo")');
  await page.waitForSelector("#nome");
  n += 1;
  await page.fill("#nome", `Teste Smoke ${sufixo}-${n}`);
  await page.fill("#whatsapp", `(11) 9${String(sufixo).padStart(4, "0").slice(-4)}${String(1000 + n)}`.slice(0, 15));
  await page.fill("#email", `smoke-${sufixo}-${n}@example.invalid`);
  if (site) await page.fill("#site", site);
  await page.click('button:has-text("Ver resultado")');
}

async function cenario(browser, nome, entrada, { esperaResultado = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await preencher(page, entrada);
  if (!esperaResultado) {
    await page.waitForTimeout(3000);
    const temResultado = await page.locator("#cmp-res-titulo").count();
    ok(`${nome}: nenhum resultado mostrado`, temResultado === 0);
    await ctx.close();
    return null;
  }
  await page.waitForSelector("#cmp-res-titulo", { timeout: 15000 });
  const titulo = await page.locator("#cmp-res-titulo").innerText();
  const texto = await page.locator("section[aria-labelledby=cmp-res-titulo]").innerText();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
  ok(`${nome}: resultado em 375px sem rolagem horizontal`, overflow <= 0, `${titulo} | overflow=${overflow}`);
  await ctx.close();
  return { titulo, texto };
}

const browser = await chromium.launch();
try {
  const a = await cenario(browser, "A-8000", { faturamento: "8000" });
  const b = await cenario(browser, "B-baixo", { faturamento: "1800", despesas: { aluguel: "1500" } });
  const c = await cenario(browser, "C-alto", { faturamento: "60000" });
  for (const [k, r] of Object.entries({ A: a, B: b, C: c })) {
    console.log(`\n--- ${k} ---\n${r?.titulo}\n${(r?.texto ?? "").replace(/\n+/g, " | ").slice(0, 900)}`);
  }
  const e = await cenario(browser, "E-empate", { faturamento: "3200" });
  ok("E: estado de empate exibido", /praticamente iguais/.test(e?.titulo ?? ""), e?.titulo);
  const f = await cenario(browser, "F-dividendos", { faturamento: "120000" });
  ok("F: aviso de dividendos exibido", (f?.texto ?? "").includes("Distribuições de lucro"));
  await cenario(browser, "D-honeypot", { faturamento: "8000", site: "http://spam.example" }, { esperaResultado: false });

  // CTA de cadastro
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await preencher(page, { faturamento: "8000" });
  await page.waitForSelector("#cmp-res-titulo");
  const href = await page.locator('a[href*="/cadastro"]').first().getAttribute("href");
  ok("CTA aponta para /cadastro?origem=comparativo", href?.includes("origem=comparativo"), String(href));
  await page.goto(`${BASE}/cadastro?origem=comparativo`);
  ok("/cadastro?origem=comparativo abre", (await page.locator("form").count()) > 0, page.url());
  await ctx.close();
} finally {
  await browser.close();
  // limpeza: leads criados por este teste
  const { data: leads } = await admin.from("Lead").select("id").eq("origem", "comparativo").gte("created_at", inicio);
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length) {
    await admin.from("LeadNota").delete().in("lead_id", ids);
    await admin.from("Lead").delete().in("id", ids);
  }
  await admin.from("VisitaPagina").delete().like("host", "127.0.0.1%").gte("created_at", inicio);
  console.log(`\nLimpeza: ${ids.length} lead(s) de teste removido(s).`);
}
const falhas = relatorio.filter((r) => !r.ok).length;
console.log(`\n${relatorio.length - falhas}/${relatorio.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
