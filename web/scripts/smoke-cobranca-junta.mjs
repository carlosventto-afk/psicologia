// Smoke test da cobrança conjunta (pacientes com o mesmo responsável financeiro) em
// /cobrancas/nova, com usuário e dados descartáveis (criados e apagados aqui).
// Rodar com o preview standalone no ar e .env.local carregado:
//   BASE=http://127.0.0.1:3100 node scripts/smoke-cobranca-junta.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = process.env.OUT ?? "./.smoke";
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suf = String(Date.now()).slice(-7);
const email = `smoke-junta-${suf}@example.invalid`;
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

let userId = null;
const pac = {};
const resp = {};
const sessoes = {}; // chave -> id

async function criarPaciente(chave, nome, documento = "recibo") {
  pac[chave] = falha(await admin.from("Paciente").insert({ owner: userId, nome, documento }).select("id").single()).id;
}
async function criarResp(chave, nome, pacientes) {
  resp[chave] = falha(await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome }).select("id").single()).id;
  for (const p of pacientes) {
    falha(await admin.from("PacienteResponsavelFinanceiro").insert({ paciente: pac[p], responsavel: resp[chave], owner: userId }));
  }
}
async function criarSessao(chave, paciente, data, horario, valor) {
  sessoes[chave] = falha(
    await admin
      .from("Sessao")
      .insert({ owner: userId, paciente: pac[paciente], data, horario, valor, status: "Realizada", Realizado: true })
      .select("id")
      .single()
  ).id;
}

async function semear() {
  const u = falha(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  userId = u.user.id;
  falha(
    await admin.from("Usuarios").insert({
      id_user: userId, nome: "Smoke Profissional", email, contato: 11999990001,
      role: "psicologo", aprovado: true, plano: "gestao", crp_conferido: false,
    })
  );
  await criarPaciente("A", "Alice Smoke");
  await criarPaciente("B", "Bruno Smoke");
  await criarPaciente("C", "Carla Smoke");
  await criarResp("mae", "Maria Responsavel Smoke", ["A", "B"]);
  await criarResp("carla", "Carla Responsavel Smoke", ["C"]);
  // novembro: Bruno tem a sessão mais antiga (principal esperado = Bruno)
  await criarSessao("A1", "A", "2026-11-10", "10:00:00", 100);
  await criarSessao("A2", "A", "2026-11-17", "10:00:00", 100);
  await criarSessao("B1", "B", "2026-11-03", "09:00:00", 80);
  await criarSessao("C1", "C", "2026-11-05", "11:00:00", 120);
  // outubro: mesmo responsável, mas o usuário mantém separadas (padrão)
  await criarSessao("A3", "A", "2026-10-06", "10:00:00", 100);
  await criarSessao("B2", "B", "2026-10-07", "10:00:00", 80);
}

async function limpar() {
  try {
    const { data: cobs } = await admin.from("Cobranca").select("id").eq("owner", userId ?? "00000000-0000-0000-0000-000000000000");
    const ids = (cobs ?? []).map((c) => c.id);
    if (ids.length) {
      await admin.from("CobrancaSessao").delete().in("cobranca", ids);
      await admin.from("Cobranca").delete().in("id", ids);
    }
    if (userId) {
      await admin.from("Sessao").delete().eq("owner", userId);
      await admin.from("PacienteResponsavelFinanceiro").delete().eq("owner", userId);
      await admin.from("ResponsavelFinanceiro").delete().eq("owner", userId);
      await admin.from("Paciente").delete().eq("owner", userId);
      await admin.from("Lead").delete().eq("email", email);
      await admin.from("Usuarios").delete().eq("id_user", userId);
      for (let i = 0; i < 3; i++) {
        await admin.auth.admin.deleteUser(userId);
        const { data } = await admin.auth.admin.getUserById(userId);
        if (!data?.user) break;
      }
    }
    console.log("Limpeza concluída.");
  } catch (e) {
    console.error("ERRO NA LIMPEZA — conferir manualmente:", e.message, { userId });
  }
}

async function cobrancasDoUsuario() {
  const cobs = falha(
    await admin
      .from("Cobranca")
      .select("id, paciente, responsavel_financeiro, valor_total, tipo_documento, periodo_referencia, CobrancaSessao(sessao, ativa)")
      .eq("owner", userId)
      .order("id")
  );
  return cobs.map((c) => ({ ...c, valor_total: Number(c.valor_total), sessoes: c.CobrancaSessao.map((v) => Number(v.sessao)).sort((a, b) => a - b) }));
}

const browser = await chromium.launch();
try {
  await semear();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  ok("login do profissional descartável", !page.url().includes("/login"), page.url());

  // --- novembro: pergunta aparece só para o grupo A+B
  await page.goto(`${BASE}/cobrancas/nova?mes=2026-11`);
  await page.waitForSelector('button:has-text("Criar")');
  const corpo = await page.locator("body").innerText();
  ok("pergunta de juntar aparece para Alice e Bruno", /Alice Smoke, Bruno Smoke têm o mesmo responsável financeiro \(Maria Responsavel Smoke\)/.test(corpo));
  ok("não pergunta para Carla (responsável próprio)", (await page.locator("fieldset").count()) === 1);
  ok("padrão é manter separadas: 3 cobranças", (await page.locator('button:has-text("Criar 3 cobranças")').count()) === 1);
  await page.screenshot({ path: `${OUT}/junta-pergunta.png`, fullPage: true });

  await page.getByLabel("Sim, juntar", { exact: false }).check();
  ok("ao juntar, o botão passa a criar 2 cobranças", (await page.locator('button:has-text("Criar 2 cobranças")').count()) === 1);
  ok("explica o paciente principal (Bruno, sessão mais antiga)", (await page.locator("fieldset").innerText()).includes("fica no nome de Bruno Smoke"));
  await page.screenshot({ path: `${OUT}/junta-sim.png`, fullPage: true });

  await page.click('button:has-text("Criar 2 cobranças")');
  await page.waitForSelector("text=cobranças criadas", { timeout: 20000 });
  ok("mensagem informa a cobrança conjunta", (await page.locator("body").innerText()).includes("reunindo vários pacientes"));

  let cobs = await cobrancasDoUsuario();
  const conjunta = cobs.find((c) => c.sessoes.length === 3);
  const carla = cobs.find((c) => c.sessoes.length === 1);
  ok("2 cobranças criadas em novembro", cobs.length === 2, JSON.stringify(cobs.map((c) => c.sessoes.length)));
  ok("conjunta tem as 3 sessões de Alice+Bruno", conjunta && [sessoes.A1, sessoes.A2, sessoes.B1].sort((a, b) => a - b).every((s, i) => conjunta.sessoes[i] === s));
  ok("paciente principal = Bruno (sessão mais antiga)", conjunta?.paciente === pac.B);
  ok("responsável da conjunta = Maria", conjunta?.responsavel_financeiro === resp.mae);
  ok("valor total somado (100+100+80)", conjunta?.valor_total === 280, String(conjunta?.valor_total));
  ok("Carla segue em cobrança própria", carla?.sessoes[0] === sessoes.C1 && carla?.paciente === pac.C);

  // --- detalhe e lista mostram os dois pacientes
  await page.goto(`${BASE}/cobrancas/${conjunta.id}`);
  const det = await page.locator("body").innerText();
  ok("detalhe: título com os dois pacientes", /Cobrança — Bruno Smoke \+ Alice Smoke/.test(det), det.split("\n").find((l) => l.startsWith("Cobrança —")));
  ok("detalhe: cada sessão mostra o paciente", det.includes("Alice Smoke") && det.includes("Bruno Smoke"));
  await page.screenshot({ path: `${OUT}/junta-detalhe.png`, fullPage: true });
  await page.goto(`${BASE}/cobrancas?paciente=${pac.A}`);
  const lista = await page.locator("div.card").allInnerTexts();
  ok("filtro por Alice encontra a cobrança conjunta (principal é Bruno)", lista.some((t) => t.includes("Bruno Smoke + Alice Smoke")));
  ok("filtro por Alice não traz a de Carla", !lista.some((t) => t.includes("Carla Smoke")));

  // --- outubro: padrão (separadas) cria uma cobrança por paciente
  await page.goto(`${BASE}/cobrancas/nova?mes=2026-10`);
  await page.waitForSelector('button:has-text("Criar")');
  ok("outubro: pergunta aparece e o padrão é separar", (await page.locator("fieldset").count()) === 1 && (await page.locator('button:has-text("Criar 2 cobranças")').count()) === 1);
  await page.click('button:has-text("Criar 2 cobranças")');
  await page.waitForSelector("text=cobranças criadas", { timeout: 20000 });
  cobs = await cobrancasDoUsuario();
  const outubro = cobs.filter((c) => c.sessoes.includes(sessoes.A3) || c.sessoes.includes(sessoes.B2));
  ok("outubro: uma cobrança por paciente", outubro.length === 2 && outubro.every((c) => c.sessoes.length === 1));

  // --- regra no banco: sessão de paciente sem vínculo com o responsável é recusada
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  falha(await anon.auth.signInWithPassword({ email, password: senha }));
  await criarSessao("A4", "A", "2026-12-01", "10:00:00", 100);
  await criarSessao("C2", "C", "2026-12-02", "10:00:00", 100);
  const naoVinculada = await anon.rpc("criar_cobranca", {
    p_paciente: pac.A, p_sessoes: [sessoes.A4, sessoes.C2], p_tipo_documento: "recibo", p_periodo: null, p_responsavel: resp.mae, p_emissao_por: null,
  });
  ok("banco recusa sessão de paciente de outro responsável", /COBRANCA:.*não foi encontrada/.test(naoVinculada.error?.message ?? ""), naoVinculada.error?.message);
  const vinculada = await anon.rpc("criar_cobranca", {
    p_paciente: pac.A, p_sessoes: [sessoes.A4], p_tipo_documento: "recibo", p_periodo: null, p_responsavel: resp.mae, p_emissao_por: null,
  });
  ok("banco aceita sessões só do paciente principal (comportamento antigo)", !vinculada.error, vinculada.error?.message);
  await ctx.close();
} finally {
  await browser.close();
  await limpar();
}
const falhas = relatorio.filter((r) => !r.ok).length;
console.log(`\n${relatorio.length - falhas}/${relatorio.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
