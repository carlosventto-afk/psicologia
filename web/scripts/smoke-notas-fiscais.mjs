// Smoke test de /notas-fiscais (download PDF/XML, lote, filtro de competência) e do
// detalhe da cobrança, com usuário e dados descartáveis (criados e apagados aqui).
// Rodar com o preview standalone no ar e .env.local carregado:
//   BASE=http://127.0.0.1:3100 node scripts/smoke-notas-fiscais.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = process.env.OUT ?? "./.smoke";
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suf = String(Date.now()).slice(-7);
const email = `smoke-nf-${suf}@example.invalid`;
const senha = `Smoke-${suf}-Xy!`;
const relatorio = [];
const ok = (nome, cond, detalhe = "") => {
  relatorio.push({ nome, ok: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const falha = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const criados = { cobrancas: [], notas: [] };
let userId = null;
let pacienteId = null;
let respId = null;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const chave = (n) => String(n).padStart(50, "0");
const xmlDps = (d) => `<DPS><infDPS><dCompet>${d}</dCompet></infDPS></DPS>`;

async function semear() {
  const u = falha(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  userId = u.user.id;
  falha(
    await admin.from("Usuarios").insert({
      id_user: userId, nome: "Smoke Profissional", email, contato: 11999990000,
      role: "psicologo", aprovado: true, plano: "gestao", crp_conferido: false,
    })
  );
  pacienteId = falha(
    await admin.from("Paciente").insert({ owner: userId, nome: "Paciente Smoke", documento: "nota_fiscal" }).select("id").single()
  ).id;
  respId = falha(
    await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Paciente Smoke" }).select("id").single()
  ).id;

  const defs = [
    { chave: "N1", status: "autorizada", comp: "2026-10-15", numero: 101, pdf: true },
    { chave: "N2", status: "autorizada", comp: "2026-11-10", numero: 102, pdf: false },
    { chave: "N3", status: "pendente", comp: "2026-11-12", numero: 103, pdf: false },
    { chave: "N4", status: "autorizada", comp: "2026-11-20", numero: 104, pdf: true },
  ];
  const ids = {};
  for (const d of defs) {
    const cobId = falha(
      await admin.from("Cobranca").insert({
        owner: userId, paciente: pacienteId, responsavel_financeiro: respId, valor_total: 150,
        tipo_documento: "nota_fiscal", situacao: "aberta", emissao_por: "cobranca",
      }).select("id").single()
    ).id;
    criados.cobrancas.push(cobId);
    const nota = falha(
      await admin.from("NotaFiscal").insert({
        owner: userId, cobranca: cobId, status: d.status, ambiente: "homologacao",
        numero: d.numero, serie: "1", dps_id: `DPS${d.numero}`, xml_dps: xmlDps(d.comp),
        chave_acesso: d.status === "pendente" ? null : chave(d.numero),
        xml_nfse: d.status === "pendente" ? null : `<NFSe><infNFSe><nNFSe>${d.numero}</nNFSe></infNFSe></NFSe>`,
        pdf_base64: d.pdf ? PDF.toString("base64") : null,
        ultimo_erro: d.status === "pendente" ? "Aguardando confirmação da prefeitura (teste)" : null,
        created_at: new Date(Date.now() - 3600_000).toISOString(),
      }).select("id").single()
    );
    criados.notas.push(nota.id);
    ids[d.chave] = { nota: nota.id, cob: cobId };
  }
  return ids;
}

async function limpar() {
  try {
    if (criados.notas.length) await admin.from("NotaFiscal").delete().in("id", criados.notas);
    if (criados.cobrancas.length) await admin.from("Cobranca").delete().in("id", criados.cobrancas);
    if (respId) await admin.from("ResponsavelFinanceiro").delete().eq("id", respId);
    if (pacienteId) await admin.from("Paciente").delete().eq("id", pacienteId);
    if (userId) {
      await admin.from("Lead").delete().eq("email", email);
      await admin.from("Usuarios").delete().eq("id_user", userId);
      for (let i = 0; i < 3; i++) {
        const r = await admin.auth.admin.deleteUser(userId);
        const { data } = await admin.auth.admin.getUserById(userId);
        if (!data?.user) break;
        console.log("deleteUser ainda não removeu; tentando de novo", r.error?.message ?? "");
      }
    }
    console.log("Limpeza concluída.");
  } catch (e) {
    console.error("ERRO NA LIMPEZA — conferir manualmente:", e.message, { userId, criados });
  }
}

function nomesNoZip(buf) {
  const nomes = [];
  let i = 0;
  while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), i)) !== -1) {
    const len = buf.readUInt16LE(i + 26);
    nomes.push(buf.subarray(i + 30, i + 30 + len).toString("utf-8"));
    i += 30 + len;
  }
  return nomes;
}

const browser = await chromium.launch();
try {
  const ids = await semear();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  ok("login do profissional descartável", !page.url().includes("/login"), page.url());

  // --- lista e competência
  await page.goto(`${BASE}/notas-fiscais`);
  const corpo = await page.locator("main, body").first().innerText();
  ok("lista mostra as 4 notas", ["101/1", "102/1", "103/1", "104/1"].every((t) => corpo.includes(t)));
  ok("competência exibida", corpo.includes("Competência: 15/10/2026") && corpo.includes("Competência: 20/11/2026"));
  ok("links PDF/XML só nas autorizadas (3)", (await page.locator('a[href*="/api/notas-fiscais/download?id="]').count()) === 6);
  ok("botão Verificar na SEFIN na pendente", (await page.locator('button:has-text("Verificar na SEFIN")').count()) === 1);

  // --- filtro de competência
  await page.fill('input[name="de"]', "2026-11-01");
  await page.fill('input[name="ate"]', "2026-11-30");
  await page.click('button:has-text("Filtrar")');
  await page.waitForURL(/de=2026-11-01/);
  const filtrado = await page.locator("body").innerText();
  ok("filtro nov/2026 mantém 102,103,104 e remove 101", !filtrado.includes("101/1") && ["102/1", "103/1", "104/1"].every((t) => filtrado.includes(t)));
  await page.goto(`${BASE}/notas-fiscais?de=2026-10-01&ate=2026-10-31`);
  const out = await page.locator("body").innerText();
  ok("filtro out/2026 mostra só 101", out.includes("101/1") && !out.includes("102/1"));
  await page.goto(`${BASE}/notas-fiscais?de=2027-01-01`);
  ok("filtro sem resultado mostra estado vazio", (await page.locator("body").innerText()).includes("Nenhuma nota nesse período"));

  // --- downloads individuais via rota
  const req = ctx.request;
  const get = (q) => req.get(`${BASE}/api/notas-fiscais/download?${q}`, { maxRedirects: 0 });
  let r = await get(`id=${ids.N1.nota}&formato=pdf`);
  const corpoPdf = await r.body();
  ok("PDF individual (N1) 200 + application/pdf + bytes originais", r.status() === 200 && r.headers()["content-type"] === "application/pdf" && corpoPdf.equals(PDF), r.headers()["content-disposition"]);
  r = await get(`id=${ids.N1.nota}&formato=xml`);
  ok("XML individual (N1) 200 + application/xml", r.status() === 200 && r.headers()["content-type"].startsWith("application/xml") && (await r.text()).includes("<nNFSe>101</nNFSe>"), r.headers()["content-disposition"]);
  r = await get(`id=${ids.N2.nota}&formato=pdf`);
  ok("PDF ausente (N2) -> 503 com mensagem clara", r.status() === 503 && (await r.text()).includes("não está disponível"));
  r = await get(`id=${ids.N2.nota}&formato=xml`);
  ok("XML de nota sem PDF (N2) ainda baixa", r.status() === 200);
  r = await get(`id=${ids.N3.nota}&formato=pdf`);
  ok("nota pendente (N3) não baixa (404)", r.status() === 404);
  r = await get(`id=${ids.N1.nota}&formato=todos`);
  let zip = await r.body();
  ok("formato=todos (N1) -> zip com PDF e XML", r.status() === 200 && r.headers()["content-type"] === "application/zip" && nomesNoZip(zip).sort().join() === "NFSe-1-101.pdf,NFSe-1-101.xml", nomesNoZip(zip).join());
  r = await get(`id=${ids.N1.nota}&id=${ids.N4.nota}&formato=pdf`);
  zip = await r.body();
  ok("lote PDF (N1+N4) -> zip com 2 PDFs", nomesNoZip(zip).sort().join() === "NFSe-1-101.pdf,NFSe-1-104.pdf", nomesNoZip(zip).join());
  r = await get(`id=${ids.N1.nota}&id=${ids.N2.nota}&formato=pdf`);
  zip = await r.body();
  ok("lote com nota sem PDF -> zip traz LEIA-ME.txt", nomesNoZip(zip).includes("LEIA-ME.txt") && nomesNoZip(zip).includes("NFSe-1-101.pdf"), nomesNoZip(zip).join());
  r = await get("formato=pdf");
  ok("sem ids -> 400", r.status() === 400);
  r = await get(`id=${ids.N1.nota}&formato=exe`);
  ok("formato inválido -> 400", r.status() === 400);
  const anon = await browser.newContext();
  r = await anon.request.get(`${BASE}/api/notas-fiscais/download?id=${ids.N1.nota}&formato=pdf`, { maxRedirects: 0 });
  ok("sem sessão não baixa (redireciona)", r.status() !== 200, String(r.status()));
  await anon.close();

  // --- lote pela interface
  await page.goto(`${BASE}/notas-fiscais`);
  const btn = page.locator('button:has-text("Baixar PDFs (.zip)")');
  ok("botões de lote desabilitados sem seleção", await btn.isDisabled());
  await page.check('input[aria-label="Selecionar todas as notas"]');
  ok("selecionar todas marca as 3 notas com documento", (await page.locator('input[name="id"]:checked').count()) === 3);
  ok("botões habilitam após seleção", await btn.isEnabled());
  const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
  const caminho = await dl.path();
  const baixado = readFileSync(caminho);
  ok("download em lote pela UI entrega .zip", /^notas-fiscais-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()) && nomesNoZip(baixado).includes("NFSe-1-101.pdf"), `${dl.suggestedFilename()} -> ${nomesNoZip(baixado).join()}`);
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click(`a[href="/api/notas-fiscais/download?id=${ids.N4.nota}&formato=xml"]`)]);
  ok("clique no link XML baixa NFSe-1-104.xml", dl2.suggestedFilename() === "NFSe-1-104.xml", dl2.suggestedFilename());

  // --- detalhe da cobrança
  await page.goto(`${BASE}/cobrancas/${ids.N1.cob}`);
  ok("cobrança: links Baixar PDF/XML na nota autorizada", (await page.locator('a:has-text("Baixar PDF")').count()) === 1 && (await page.locator('a:has-text("Baixar XML")').count()) === 1);
  await page.goto(`${BASE}/cobrancas/${ids.N3.cob}`);
  ok("cobrança pendente: botão Verificar na SEFIN", (await page.locator('button:has-text("Verificar na SEFIN")').count()) === 1);

  // --- mobile
  const m = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await m.addCookies(await ctx.cookies());
  const mp = await m.newPage();
  await mp.goto(`${BASE}/notas-fiscais`);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mp.screenshot({ path: `${OUT}/notas-fiscais-375.png`, fullPage: true });
  ok("/notas-fiscais em 375px sem rolagem horizontal", overflow <= 0, `overflow=${overflow}`);
  await m.close();
} catch (e) {
  console.error("ERRO:", e);
  relatorio.push({ nome: "execução", ok: false });
} finally {
  await browser.close();
  await limpar();
}
const falhas = relatorio.filter((r) => !r.ok).length;
console.log(`\n${relatorio.length - falhas}/${relatorio.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
