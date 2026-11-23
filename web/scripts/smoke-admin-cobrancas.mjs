// Smoke test das telas de admin (CRM /admin/leads, liberação temporária de plano em
// /admin/profissionais, banner de teste) e de /cobrancas, com usuários e dados
// descartáveis (criados e apagados aqui). Preview standalone no ar + .env.local:
//   BASE=http://127.0.0.1:3100 node scripts/smoke-admin-cobrancas.mjs
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
const senha = `Smoke-${suf}-Xy!`;
const relatorio = [];
const ok = (nome, cond, detalhe = "") => {
  relatorio.push({ nome, ok: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const dado = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const contas = {}; // papel -> { id, email }
const lixo = { cobrancas: [], sessoes: [], pacientes: [], resp: [], leads: [] };

async function criarConta(papel, extra = {}) {
  const email = `smoke-${papel}-${suf}@example.invalid`;
  const u = dado(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  contas[papel] = { id: u.user.id, email }; // registrado antes do resto, para a limpeza achar
  dado(
    await admin.from("Usuarios").insert({
      id_user: u.user.id, nome: `Smoke ${papel}`, email, contato: Number(`119${suf}${Object.keys(contas).length}`),
      role: papel === "admin" ? "admin" : "psicologo", aprovado: true, plano: "gratis", crp_conferido: true, ...extra,
    })
  );
}

async function entrar(browser, papel, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', contas[papel].email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  return { ctx, page };
}

async function limpar() {
  try {
    if (lixo.cobrancas.length) await admin.from("Cobranca").delete().in("id", lixo.cobrancas);
    if (lixo.sessoes.length) await admin.from("Sessao").delete().in("id", lixo.sessoes);
    if (lixo.resp.length) await admin.from("ResponsavelFinanceiro").delete().in("id", lixo.resp);
    if (lixo.pacientes.length) await admin.from("Paciente").delete().in("id", lixo.pacientes);
    const { data: leads } = await admin.from("Lead").select("id").like("nome", `Smoke Lead ${suf}%`);
    const ids = (leads ?? []).map((l) => l.id);
    if (ids.length) {
      await admin.from("LeadNota").delete().in("lead_id", ids);
      await admin.from("Lead").delete().in("id", ids);
    }
    for (const c of Object.values(contas)) {
      await admin.from("Lead").delete().eq("email", c.email); // lead automático de cadastro (se houver)
      const { data: u } = await admin.from("Usuarios").select("id").eq("id_user", c.id).maybeSingle();
      if (u) await admin.from("EventoAssinatura").delete().eq("usuario", u.id); // FK: eventos do teste de plano
      await admin.from("Usuarios").delete().eq("id_user", c.id);
      for (let i = 0; i < 3; i++) {
        await admin.auth.admin.deleteUser(c.id);
        const { data } = await admin.auth.admin.getUserById(c.id);
        if (!data?.user) break;
      }
    }
    console.log("Limpeza concluída.");
  } catch (e) {
    console.error("ERRO NA LIMPEZA — conferir manualmente:", e.message, { contas, lixo });
  }
}

const browser = await chromium.launch();
try {
  await criarConta("admin");
  await criarConta("prof", { plano: "gestao" });
  await criarConta("alvo"); // plano grátis: recebe teste

  // ===== CRM /admin/leads =====
  {
    const { ctx, page } = await entrar(browser, "admin");
    await page.goto(`${BASE}/admin/leads`);
    ok("/admin/leads abre para admin", (await page.locator("h1").innerText()).includes("CRM"));
    const nome = `Smoke Lead ${suf}`;
    await page.fill("#nome", nome);
    await page.fill("#telefone", "11988887777");
    await page.click('button:has-text("Novo lead")');
    await page.waitForTimeout(2500);
    const { data: criado } = await admin.from("Lead").select("id, estagio, origem").eq("nome", nome).maybeSingle();
    ok("criar lead manual grava Lead (origem manual, estágio novo)", criado && criado.origem === "manual" && criado.estagio === "novo", JSON.stringify(criado));
    if (criado) {
      lixo.leads.push(criado.id);
      await page.goto(`${BASE}/admin/leads`);
      const card = page.locator("div.card", { hasText: nome }).first();
      await card.locator("select").selectOption("qualificado");
      await page.waitForTimeout(2000);
      const { data: l2 } = await admin.from("Lead").select("estagio").eq("id", criado.id).single();
      ok("trocar estágio grava no banco", l2?.estagio === "qualificado", l2?.estagio);
      await page.goto(`${BASE}/admin/leads?estagio=qualificado`);
      ok("filtro por estágio lista o lead", (await page.locator("body").innerText()).includes(nome));
      await page.goto(`${BASE}/admin/leads?estagio=perdido`);
      ok("filtro por outro estágio não lista", !(await page.locator("body").innerText()).includes(nome));
      await page.goto(`${BASE}/admin/leads/${criado.id}`);
      await page.fill('textarea[name="texto"]', "Nota de teste do smoke");
      await page.click('button:has-text("Adicionar nota")');
      await page.waitForTimeout(2500);
      const { data: notas } = await admin.from("LeadNota").select("texto").eq("lead_id", criado.id);
      ok("adicionar nota grava LeadNota", notas?.length === 1 && notas[0].texto.includes("smoke"), String(notas?.length));
      await page.reload();
      ok("nota aparece no histórico", (await page.locator("body").innerText()).includes("Nota de teste do smoke"));
    }
    await ctx.close();
  }

  // ===== Liberação temporária de plano (item 22) =====
  {
    const { ctx, page } = await entrar(browser, "admin");
    await page.goto(`${BASE}/admin/profissionais`);
    const linha = page.locator("div.card", { hasText: "Smoke alvo" }).first();
    ok("profissional grátis mostra o formulário de liberar teste", (await linha.locator('button:has-text("Liberar teste")').count()) === 1);
    await linha.locator('select[aria-label="Plano do teste"]').selectOption("gestao");
    await linha.locator('input[aria-label="Dias de teste"]').fill("10");
    await linha.locator('button:has-text("Liberar teste")').click();
    await page.waitForTimeout(3000);
    const { data: u1 } = await admin.from("Usuarios").select("teste_plano, teste_expira_em, plano").eq("id_user", contas.alvo.id).single();
    const dias = u1?.teste_expira_em ? (Date.parse(u1.teste_expira_em) - Date.now()) / 86400000 : null;
    ok("liberar teste grava plano e ~10 dias", u1?.teste_plano === "gestao" && dias > 9 && dias < 10.1, JSON.stringify(u1));
    await page.reload();
    const linha2 = page.locator("div.card", { hasText: "Smoke alvo" }).first();
    ok("tela mostra 'Em teste' com Encerrar e Estender", (await linha2.innerText()).includes("Em teste") && (await linha2.locator('button:has-text("Estender")').count()) === 1);
    await linha2.locator('button:has-text("Estender")').click();
    await page.waitForTimeout(2500);
    const { data: u2 } = await admin.from("Usuarios").select("teste_expira_em").eq("id_user", contas.alvo.id).single();
    const dias2 = (Date.parse(u2.teste_expira_em) - Date.now()) / 86400000;
    ok("estender soma 7 dias (~17)", dias2 > 16 && dias2 < 17.1, dias2?.toFixed(2));

    // banner: força prazo de 2 dias e olha a conta do profissional
    await admin.from("Usuarios").update({ teste_expira_em: new Date(Date.now() + 2.5 * 86400000).toISOString() }).eq("id_user", contas.alvo.id);
    const alvo = await entrar(browser, "alvo");
    await alvo.page.goto(`${BASE}/painel`);
    const textoAlvo = await alvo.page.locator("body").innerText();
    ok("banner do teste aparece para o profissional", /testando o plano/i.test(textoAlvo) && /termina em/.test(textoAlvo), (textoAlvo.match(/Você está testando[^\n]*/) ?? [""])[0]);
    await alvo.ctx.close();

    await linha2.locator('button:has-text("Encerrar")').click();
    await page.waitForTimeout(2500);
    const { data: u3 } = await admin.from("Usuarios").select("teste_plano, teste_expira_em, plano").eq("id_user", contas.alvo.id).single();
    ok("encerrar volta ao Grátis e limpa o teste", u3?.plano === "gratis" && !u3?.teste_expira_em && !u3?.teste_plano, JSON.stringify(u3));
    await ctx.close();
  }

  // ===== Cobranças (item 32) =====
  {
    const owner = contas.prof.id;
    const pac = dado(await admin.from("Paciente").insert({ owner, nome: "Paciente Cobranca Smoke", documento: "recibo" }).select("id").single()).id;
    lixo.pacientes.push(pac);
    const resp = dado(await admin.from("ResponsavelFinanceiro").insert({ owner, nome: "Paciente Cobranca Smoke" }).select("id").single()).id;
    lixo.resp.push(resp);
    const hoje = new Date().toISOString().slice(0, 10);
    const sessao = await admin.from("Sessao").insert({ owner, paciente: pac, data: hoje, valor: 150 }).select("id").single();
    if (sessao.error) console.log("seed Sessao:", sessao.error.message);
    else lixo.sessoes.push(sessao.data.id);
    const cob = dado(
      await admin.from("Cobranca").insert({
        owner, paciente: pac, responsavel_financeiro: resp, valor_total: 150,
        tipo_documento: "recibo", situacao: "aberta", emissao_por: "cobranca",
      }).select("id").single()
    ).id;
    lixo.cobrancas.push(cob);

    const { ctx, page } = await entrar(browser, "prof");
    await page.goto(`${BASE}/cobrancas`);
    const txt = await page.locator("body").innerText();
    ok("/cobrancas lista a cobrança aberta", (await page.locator("div.card", { hasText: "Paciente Cobranca Smoke" }).count()) === 1 && /150/.test(txt));
    await page.goto(`${BASE}/cobrancas?situacao=recebida`);
    // o <select> de paciente também contém o nome: conferir só os cartões da lista
    ok("filtro de situação esconde a aberta", (await page.locator("div.card", { hasText: "Paciente Cobranca Smoke" }).count()) === 0);
    await page.goto(`${BASE}/cobrancas/${cob}`);
    const det = await page.locator("body").innerText();
    ok("detalhe da cobrança mostra valor e formulário de receber", /150/.test(det) && /Receber cobrança/.test(det));
    await page.goto(`${BASE}/cobrancas/nova`);
    ok("/cobrancas/nova abre", (await page.locator("h1").first().innerText()).length > 0 && !page.url().includes("login"));
    await page.goto(`${BASE}/pacientes/${pac}?aba=cobrancas`);
    ok("aba Cobranças no paciente mostra a cobrança", (await page.locator("body").innerText()).includes("150"));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/cobrancas`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${OUT}/cobrancas-375.png`, fullPage: true });
    ok("/cobrancas em 375px sem rolagem horizontal", overflow <= 0, `overflow=${overflow}`);
    await ctx.close();
  }
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
