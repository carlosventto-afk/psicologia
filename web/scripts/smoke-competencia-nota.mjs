// Smoke test da competência da NFS-e (Configurações → NFS-e e emissão), com usuário e dados
// descartáveis (criados e apagados aqui) e um nfse-service FALSO que o próprio script sobe:
// ele guarda o payload de cada /emitir e responde "autorizada", então nada vai à SEFIN.
//
// Rodar com o preview standalone no ar, apontando para o serviço falso, e .env.local carregado:
//   NFSE_SERVICE_URL=http://127.0.0.1:8097 NFSE_SERVICE_SECRET=smoke-secret node .next/standalone/server.js
//   BASE=http://127.0.0.1:3100 node scripts/smoke-competencia-nota.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import http from "node:http";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 8097);
const OUT = process.env.OUT ?? "./.smoke";
mkdirSync(OUT, { recursive: true });
const SEGREDO = process.env.NFSE_SERVICE_SECRET ?? "smoke-secret";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suf = String(Date.now()).slice(-7);
const email = `smoke-comp-${suf}@example.invalid`;
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
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Datas relativas a hoje (São Paulo), para o teste valer em qualquer dia.
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dia = (n) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataBR = (iso) => iso.split("-").reverse().join("/");

// --- nfse-service falso -------------------------------------------------------------
const capturas = [];
const b64 = (t) => Buffer.from(t).toString("base64");
const servidor = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    const json = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.headers["x-nfse-secret"] !== SEGREDO) return json(401, { detail: "Nao autorizado." });
    if (req.method === "POST" && req.url === "/emitir") {
      const p = JSON.parse(corpo);
      capturas.push(p);
      return json(200, {
        autorizada: true,
        dps_id: `DPS${p.numero}`,
        chave_acesso: String(p.numero).padStart(50, "0"),
        numero_nfse: String(p.numero),
        // o serviço real grava a competência recebida em dCompet; o app a lê daqui para exibir
        xml_dps_base64: b64(`<DPS><infDPS><dCompet>${p.competencia}</dCompet></infDPS></DPS>`),
        xml_nfse_base64: b64("<NFSe><infNFSe/></NFSe>"),
        pdf_base64: null,
        erros: [],
      });
    }
    return json(404, { detail: "serviço falso: rota inesperada" });
  });
});

async function aguardarCaptura(n, ms = 25000) {
  const fim = Date.now() + ms;
  while (capturas.length < n && Date.now() < fim) await espera(250);
  return capturas.length >= n;
}

// --- dados descartáveis ---------------------------------------------------------------
let userId = null;
const ids = { sessoes: [], cobrancas: {} };
let pacienteId = null;
let respId = null;
let contaId = null;

async function semear() {
  const u = falha(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  userId = u.user.id;
  falha(
    await admin.from("Usuarios").insert({
      id_user: userId, nome: "Smoke Profissional", email, contato: 11999990003,
      role: "psicologo", aprovado: true, plano: "gestao", crp_conferido: false, crp: "05/12345",
    })
  );
  falha(
    await admin.from("DadosFiscaisProfissional").insert({
      owner: userId, tipo_documento: "cpf", documento: "11144477735", nome_empresarial: "Smoke Profissional",
      email_nfse: email, logradouro: "Rua Smoke", numero: "1", bairro: "Centro", municipio_ibge: "3304557",
      uf: "RJ", cep: "20040020", optante_simples_nacional: 3, regime_apuracao_sn: 1,
      codigo_tributacao_nacional: "041601", certificado_pfx_cifrado: "pfx-falso", certificado_senha_cifrada: "senha-falsa",
      certificado_validade: "2099-01-01", ambiente: "homologacao", emissao_automatica: false,
    })
  );
  contaId = falha(
    await admin.from("ContaFinanceira").insert({ owner: userId, codigo: "C001", nome: "Conta Smoke", banco: "Banco Smoke" }).select("id").single()
  ).id;
  pacienteId = falha(
    await admin.from("Paciente").insert({ owner: userId, nome: "Paciente Smoke", documento: "nota_fiscal", cpf: "11144477735" }).select("id").single()
  ).id;
  respId = falha(
    await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Responsavel Smoke", cpf_cnpj: "11144477735" }).select("id").single()
  ).id;
  falha(await admin.from("PacienteResponsavelFinanceiro").insert({ paciente: pacienteId, responsavel: respId, owner: userId }));
}

async function sessao(data) {
  const id = falha(
    await admin
      .from("Sessao")
      .insert({ owner: userId, paciente: pacienteId, data, horario: "10:00:00", valor: 100, status: "Realizada", Realizado: true })
      .select("id")
      .single()
  ).id;
  ids.sessoes.push(id);
  return id;
}

let anon;
async function novaCobranca(chave, datas) {
  const sessoes = [];
  for (const d of datas) sessoes.push(await sessao(d));
  const id = falha(
    await anon.rpc("criar_cobranca", {
      p_paciente: pacienteId, p_sessoes: sessoes, p_tipo_documento: "nota_fiscal", p_periodo: null,
      p_responsavel: respId, p_emissao_por: "cobranca",
    })
  );
  ids.cobrancas[chave] = id;
  return id;
}

const definirOrigem = async (origem) => falha(await admin.from("DadosFiscaisProfissional").update({ competencia_origem: origem }).eq("owner", userId).select("competencia_origem"));
const origemNoBanco = async () => falha(await admin.from("DadosFiscaisProfissional").select("competencia_origem").eq("owner", userId).single()).competencia_origem;
const notasDaCobranca = async (id) => falha(await admin.from("NotaFiscal").select("id, status, numero, xml_dps").eq("cobranca", id));
const proximoNumero = async () => falha(await admin.from("DadosFiscaisProfissional").select("proximo_numero").eq("owner", userId).single()).proximo_numero;

async function limpar() {
  if (!userId) return;
  const falhou = [];
  const q = async (nome, p) => {
    const r = await p;
    if (r.error) falhou.push(`${nome}: ${r.error.message}`);
    return r;
  };
  try {
    await q("NotaFiscal", admin.from("NotaFiscal").delete().eq("owner", userId));
    const { data: recs } = await admin.from("Recebimento").select("id, lancamento").eq("owner", userId);
    for (const r of recs ?? []) {
      await q("RecebimentoSessao", admin.from("RecebimentoSessao").delete().eq("recebimento", r.id));
      await q("Recebimento", admin.from("Recebimento").delete().eq("id", r.id));
      await q("LancamentoFinanceiro", admin.from("LancamentoFinanceiro").delete().eq("id", r.lancamento));
    }
    const { data: cobs } = await admin.from("Cobranca").select("id").eq("owner", userId);
    const cobIds = (cobs ?? []).map((c) => c.id);
    if (cobIds.length) {
      await q("CobrancaSessao", admin.from("CobrancaSessao").delete().in("cobranca", cobIds));
      await q("Cobranca", admin.from("Cobranca").delete().in("id", cobIds));
    }
    await q("Sessao", admin.from("Sessao").delete().eq("owner", userId));
    await q("PacienteResponsavelFinanceiro", admin.from("PacienteResponsavelFinanceiro").delete().eq("owner", userId));
    await q("ResponsavelFinanceiro", admin.from("ResponsavelFinanceiro").delete().eq("owner", userId));
    await q("Paciente", admin.from("Paciente").delete().eq("owner", userId));
    await q("ContaFinanceira", admin.from("ContaFinanceira").delete().eq("owner", userId));
    await q("DadosFiscaisProfissional", admin.from("DadosFiscaisProfissional").delete().eq("owner", userId));
    await q("Lead", admin.from("Lead").delete().eq("email", email));
    await q("Usuarios", admin.from("Usuarios").delete().eq("id_user", userId));
    for (let i = 0; i < 3; i++) {
      await admin.auth.admin.deleteUser(userId);
      const { data } = await admin.auth.admin.getUserById(userId);
      if (!data?.user) break;
    }
    // Conferência: nada pode sobrar do usuário descartável.
    const sobras = [];
    for (const [tabela, coluna] of [
      ["NotaFiscal", "owner"], ["Recebimento", "owner"], ["Cobranca", "owner"], ["Sessao", "owner"], ["Paciente", "owner"],
      ["ResponsavelFinanceiro", "owner"], ["ContaFinanceira", "owner"], ["DadosFiscaisProfissional", "owner"], ["Usuarios", "id_user"],
    ]) {
      const { count } = await admin.from(tabela).select("*", { count: "exact", head: true }).eq(coluna, userId);
      if (count) sobras.push(`${tabela}=${count}`);
    }
    if (falhou.length || sobras.length) console.error("LIMPEZA INCOMPLETA — conferir manualmente:", { userId, falhou, sobras });
    else console.log("Limpeza concluída (nenhum resíduo).");
  } catch (e) {
    console.error("ERRO NA LIMPEZA — conferir manualmente:", e.message, { userId });
  }
}

// --- UI -------------------------------------------------------------------------------
async function receber(page, cobrancaId, dataISO) {
  await page.goto(`${BASE}/cobrancas/${cobrancaId}`);
  await page.fill(`#data_recebimento-${cobrancaId}`, dataISO);
  await page.selectOption(`#conta-${cobrancaId}`, String(contaId));
  await page.click('button:has-text("Confirmar recebimento")');
  await page.waitForURL(new RegExp(`/cobrancas/${cobrancaId}$`), { timeout: 20000 });
}

await new Promise((r) => servidor.listen(FAKE_PORT, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  await semear();
  anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  falha(await anon.auth.signInWithPassword({ email, password: senha }));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  ok("login do profissional descartável", !page.url().includes("/login"), page.url());

  // --- Configurações → NFS-e: cartão "Competência da nota"
  await page.goto(`${BASE}/configuracoes/nfse`);
  const cartao = page.locator('form:has(input[name="competencia_origem"])');
  const temCartao = (await cartao.count()) === 1;
  ok("config: existe o cartão com as duas opções", temCartao && (await cartao.locator('input[name="competencia_origem"]').count()) === 2);
  if (temCartao) {
    ok("config: padrão é a data dos atendimentos", await cartao.locator('input[value="atendimentos"]').isChecked());
    await cartao.screenshot({ path: `${OUT}/competencia-cartao.png` });
    ok("config: explica o regime de caixa (confirmar com o contador)", /regime de caixa/i.test(await cartao.innerText()) && /contador/i.test(await cartao.innerText()));
    await cartao.locator('input[value="pagamento"]').check();
    await cartao.locator('button:has-text("Salvar")').click();
    await page.waitForSelector("text=Configuração salva.", { timeout: 15000 }).catch(() => {});
    ok("config: salvar 'pagamento' grava no banco", (await origemNoBanco()) === "pagamento", await origemNoBanco());
    await page.goto(`${BASE}/configuracoes/nfse`);
    ok("config: ao reabrir, 'pagamento' continua marcado", await page.locator('form:has(input[name="competencia_origem"]) input[value="pagamento"]').isChecked());
    await page.locator('form:has(input[name="competencia_origem"]) input[value="atendimentos"]').check();
    await page.locator('form:has(input[name="competencia_origem"]) button:has-text("Salvar")').click();
    await page.waitForSelector("text=Configuração salva.", { timeout: 15000 }).catch(() => {});
    ok("config: voltar para 'atendimentos' grava no banco", (await origemNoBanco()) === "atendimentos");
  }

  // --- celular: a tela de configuração não pode rolar na horizontal
  const celular = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await celular.addCookies(await ctx.cookies());
  const pc = await celular.newPage();
  await pc.goto(`${BASE}/configuracoes/nfse`);
  const sobra = await pc.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("config em 375px sem rolagem horizontal", sobra <= 0, `overflow=${sobra}`);
  await celular.close();

  // --- A) origem 'atendimentos' (padrão): competência = data do último atendimento
  await definirOrigem("atendimentos");
  const A = await novaCobranca("A", [dia(-50), dia(-35)]);
  await receber(page, A, dia(-10));
  await page.click('button:has-text("Emitir nota")');
  const chegouA = await aguardarCaptura(1);
  ok("A (atendimentos): o serviço recebeu a emissão", chegouA);
  ok("A (atendimentos): competência = data do último atendimento", capturas[0]?.competencia === dia(-35), `${capturas[0]?.competencia} (esperado ${dia(-35)})`);

  // --- B) origem 'pagamento': competência = data do pagamento; descrição mantém os atendimentos
  await definirOrigem("pagamento");
  const B = await novaCobranca("B", [dia(-28), dia(-21)]);
  await receber(page, B, dia(-3));
  await page.click('button:has-text("Emitir nota")');
  const chegouB = await aguardarCaptura(2);
  ok("B (pagamento): o serviço recebeu a emissão", chegouB);
  ok("B (pagamento): competência = data do pagamento", capturas[1]?.competencia === dia(-3), `${capturas[1]?.competencia} (esperado ${dia(-3)})`);
  ok(
    "B (pagamento): a descrição continua listando as datas dos atendimentos",
    String(capturas[1]?.descricao_servico).includes(dataBR(dia(-28))) && String(capturas[1]?.descricao_servico).includes(dataBR(dia(-21))),
    String(capturas[1]?.descricao_servico).split("\n")[0],
  );
  await espera(1500);
  const notasB = await notasDaCobranca(B);
  ok("B (pagamento): nota autorizada com a competência do pagamento no XML da DPS", notasB.length === 1 && notasB[0].status === "autorizada" && String(notasB[0].xml_dps).includes(`<dCompet>${dia(-3)}</dCompet>`), JSON.stringify(notasB.map((n) => n.status)));
  await page.goto(`${BASE}/notas-fiscais`);
  ok("B (pagamento): a lista de notas mostra a competência do pagamento", (await page.locator("body").innerText()).includes(`Competência: ${dataBR(dia(-3))}`));

  // --- D) pagamento com data futura: não emite, não gasta número, explica
  const numeroAntes = await proximoNumero();
  const D = await novaCobranca("D", [dia(-7)]);
  await receber(page, D, dia(10));
  await page.click('button:has-text("Emitir nota")');
  await page.waitForSelector("text=A data do pagamento é futura", { timeout: 15000 }).catch(() => {});
  ok("D (pagamento futuro): a tela explica que a data do pagamento é futura", await page.getByText("A data do pagamento é futura").first().isVisible().catch(() => false));
  await espera(500);
  ok("D (pagamento futuro): nada foi enviado ao serviço", capturas.length === 2, `capturas=${capturas.length}`);
  ok("D (pagamento futuro): nenhuma nota criada e nenhum número gasto", (await notasDaCobranca(D)).length === 0 && (await proximoNumero()) === numeroAntes);

  // --- C) emissão automática ao receber, com 'pagamento'
  falha(await admin.from("DadosFiscaisProfissional").update({ emissao_automatica: true }).eq("owner", userId).select("owner"));
  const C = await novaCobranca("C", [dia(-14)]);
  await receber(page, C, hoje);
  const chegouC = await aguardarCaptura(3, 40000);
  ok("C (automática, pagamento): o serviço recebeu a emissão", chegouC);
  ok("C (automática, pagamento): competência = data do pagamento (hoje)", capturas[2]?.competencia === hoje, `${capturas[2]?.competencia} (esperado ${hoje})`);

  await ctx.close();
} catch (e) {
  console.error("ERRO:", e);
  relatorio.push({ nome: "execução", ok: false });
} finally {
  await browser.close();
  servidor.close();
  await limpar();
}
const falhas = relatorio.filter((r) => !r.ok).length;
console.log(`\n${relatorio.length - falhas}/${relatorio.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
