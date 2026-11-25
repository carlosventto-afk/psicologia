// Smoke test da edição de responsável financeiro (/responsaveis-financeiros/[id]/editar),
// com usuário e dados descartáveis (criados e apagados aqui).
// Rodar com o preview standalone no ar e .env.local carregado:
//   BASE=http://127.0.0.1:3100 node scripts/smoke-responsavel-editar.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suf = String(Date.now()).slice(-7);
const email = `smoke-resp-${suf}@example.invalid`;
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

async function limpar() {
  try {
    if (userId) {
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

const browser = await chromium.launch();
try {
  const u = falha(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  userId = u.user.id;
  falha(
    await admin.from("Usuarios").insert({
      id_user: userId, nome: "Smoke Profissional", email, contato: 11999990002,
      role: "psicologo", aprovado: true, plano: "gestao", crp_conferido: false,
    })
  );
  const ana = falha(await admin.from("Paciente").insert({ owner: userId, nome: "Ana Smoke", cpf: "11122233344" }).select("id").single()).id;
  const bia = falha(await admin.from("Paciente").insert({ owner: userId, nome: "Bia Smoke" }).select("id").single()).id;
  const resp = falha(
    await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Ana Responsavel", paciente_vinculado: null }).select("id").single()
  ).id;
  falha(await admin.from("PacienteResponsavelFinanceiro").insert({ paciente: bia, responsavel: resp, owner: userId }));
  // outro responsável já é o "próprio" de Ana (índice único em paciente_vinculado)
  falha(await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Ana Propria", paciente_vinculado: ana }));

  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);

  await page.goto(`${BASE}/responsaveis-financeiros`);
  const card = page.locator("div.card", { hasText: "Ana Responsavel" });
  ok("lista mostra o link Editar", (await card.locator('a:has-text("Editar")').count()) === 1);
  await card.locator('a:has-text("Editar")').click();
  await page.waitForURL(new RegExp(`/responsaveis-financeiros/${resp}/editar`));
  ok("formulário vem preenchido com o nome atual", (await page.inputValue("#nome")) === "Ana Responsavel");

  // vincular a um paciente que já tem responsável próprio → mensagem clara
  await page.selectOption("#paciente_vinculado", String(ana));
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForSelector("text=já está vinculado a outro responsável", { timeout: 15000 });
  ok("vínculo duplicado mostra mensagem clara", true);

  // editar o CPF e salvar
  await page.selectOption("#paciente_vinculado", "");
  await page.fill("#cpf_cnpj", "529.982.247-25");
  await page.fill("#email", "ana.resp@example.invalid");
  await Promise.all([page.waitForURL(/\/responsaveis-financeiros$/, { timeout: 15000 }), page.click('button:has-text("Salvar alterações")')]);
  const salvo = falha(await admin.from("ResponsavelFinanceiro").select("cpf_cnpj, email, nome").eq("id", resp).single());
  ok("alterações gravadas e volta para a lista", salvo.cpf_cnpj === "529.982.247-25" && salvo.email === "ana.resp@example.invalid", JSON.stringify(salvo));

  // outro usuário não edita o responsável (RLS)
  const nova = await page.goto(`${BASE}/responsaveis-financeiros/99999999/editar`);
  ok("id inexistente/alheio dá 404", nova.status() === 404, String(nova.status()));
} finally {
  await browser.close();
  await limpar();
}
const falhas = relatorio.filter((r) => !r.ok).length;
console.log(`\n${relatorio.length - falhas}/${relatorio.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
