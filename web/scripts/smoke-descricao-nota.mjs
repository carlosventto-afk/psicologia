// Smoke test da descrição da NFS-e com o paciente (nota no nome do responsável financeiro), da flag
// "Não imprimir na nota fiscal" no cadastro do paciente e do nome dos arquivos baixados, com usuário e
// dados descartáveis (criados e apagados aqui) e um nfse-service FALSO que o próprio script sobe:
// ele guarda o payload de cada /emitir, responde "autorizada" e desenha um PDF de mentira em /danfse,
// então nada vai à SEFIN.
//
// Rodar com o preview standalone no ar, apontando para o serviço falso, e .env.local carregado:
//   PORT=3100 HOSTNAME=127.0.0.1 NFSE_SERVICE_URL=http://127.0.0.1:8097 NFSE_SERVICE_SECRET=smoke-secret \
//     node --env-file=.env.local .next/standalone/server.js
//   BASE=http://127.0.0.1:3100 node --env-file=.env.local scripts/smoke-descricao-nota.mjs
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
const email = `smoke-desc-${suf}@example.invalid`;
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

// Pagamento sempre 3 dias atrás (São Paulo); as sessões têm datas fixas no passado para o texto ser previsível.
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dia = (n) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const PAGAMENTO = dia(-3);
const PG = PAGAMENTO.split("-").reverse().join("-");

const PROF = "Smoke Profissional";
const CRP = "05/12345";

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
        xml_dps_base64: b64(`<DPS><infDPS><dCompet>${p.competencia}</dCompet></infDPS></DPS>`),
        xml_nfse_base64: b64("<NFSe><infNFSe/></NFSe>"),
        pdf_base64: null,
        erros: [],
      });
    }
    if (req.method === "POST" && req.url === "/danfse") {
      const p = JSON.parse(corpo);
      return json(200, { resultados: (p.notas ?? []).map((n) => ({ id: n.id, pdf_base64: b64("%PDF-1.4 smoke") })) });
    }
    return json(404, { detail: "serviço falso: rota inesperada" });
  });
});

async function aguardarCaptura(n, ms = 25000) {
  const fim = Date.now() + ms;
  while (capturas.length < n && Date.now() < fim) await espera(250);
  return capturas.length >= n;
}

// --- dados descartáveis (todos fictícios) --------------------------------------------
let userId = null;
let contaId = null;
let consultorioId = null;
const pac = {};
const resp = {};

async function semear() {
  const u = falha(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  userId = u.user.id;
  falha(
    await admin.from("Usuarios").insert({
      id_user: userId, nome: PROF, email, contato: 11999990004,
      role: "psicologo", aprovado: true, plano: "gestao", crp_conferido: false, crp: CRP,
    })
  );
  falha(
    await admin.from("DadosFiscaisProfissional").insert({
      owner: userId, tipo_documento: "cpf", documento: "11144477735", nome_empresarial: PROF,
      email_nfse: email, logradouro: "Rua Smoke", numero: "1", bairro: "Centro", municipio_ibge: "3304557",
      uf: "RJ", cep: "20040020", optante_simples_nacional: 3, regime_apuracao_sn: 1,
      codigo_tributacao_nacional: "041601", certificado_pfx_cifrado: "pfx-falso", certificado_senha_cifrada: "senha-falsa",
      certificado_validade: "2099-01-01", ambiente: "homologacao", emissao_automatica: false,
    })
  );
  contaId = falha(
    await admin.from("ContaFinanceira").insert({ owner: userId, codigo: "C001", nome: "Conta Smoke", banco: "Banco Smoke" }).select("id").single()
  ).id;
  consultorioId = falha(
    await admin.from("Consultorio").insert({ owner: userId, nome: "Consultorio Smoke", telefone: "11999990000", email_atendimento: email }).select("id").single()
  ).id;

  const novoPaciente = async (nome, extra) =>
    falha(
      await admin
        .from("Paciente")
        .insert({ owner: userId, nome, documento: "nota_fiscal", consultorio: consultorioId, valor_sessao: 100, ...extra })
        .select("id")
        .single()
    ).id;
  pac.helena = await novoPaciente("Helena Prado Souza", { cpf: "52998224725" });
  pac.joao = await novoPaciente("João Pedro Alves", { cpf: "11144477735", nao_imprimir_na_nota: true });
  pac.pedro = await novoPaciente("Pedro Alves Neto", {});
  pac.maria = await novoPaciente("Maria Souza", { cpf: "39053344705" });

  resp.marta = falha(
    await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Marta Alves Souza", cpf_cnpj: "98765432100" }).select("id").single()
  ).id;
  for (const p of [pac.helena, pac.joao, pac.pedro]) {
    falha(await admin.from("PacienteResponsavelFinanceiro").insert({ paciente: p, responsavel: resp.marta, owner: userId }));
  }
  // responsável "próprio": aponta para a própria paciente (a nota sai no nome dela)
  resp.maria = falha(
    await admin.from("ResponsavelFinanceiro").insert({ owner: userId, nome: "Maria Souza", paciente_vinculado: pac.maria }).select("id").single()
  ).id;
  falha(await admin.from("PacienteResponsavelFinanceiro").insert({ paciente: pac.maria, responsavel: resp.maria, owner: userId }));
}

let anon;
const cobranca = {};
async function novaCobranca(chave, { principal, responsavel, sessoes }) {
  const ids = [];
  for (const [quem, data] of sessoes) {
    ids.push(
      falha(
        await admin
          .from("Sessao")
          .insert({ owner: userId, paciente: pac[quem], data, horario: "10:00:00", valor: 100, status: "Realizada", Realizado: true })
          .select("id")
          .single()
      ).id
    );
  }
  cobranca[chave] = falha(
    await anon.rpc("criar_cobranca", {
      p_paciente: pac[principal], p_sessoes: ids, p_tipo_documento: "nota_fiscal", p_periodo: null,
      p_responsavel: resp[responsavel], p_emissao_por: "cobranca",
    })
  );
  return cobranca[chave];
}

const notaDaCobranca = async (id) => falha(await admin.from("NotaFiscal").select("id, status, numero, serie").eq("cobranca", id)).at(0);
const flagNoBanco = async (id) => falha(await admin.from("Paciente").select("nao_imprimir_na_nota").eq("id", id).single()).nao_imprimir_na_nota;

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
    await q("Consultorio", admin.from("Consultorio").delete().eq("owner", userId));
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
      ["ResponsavelFinanceiro", "owner"], ["Consultorio", "owner"], ["ContaFinanceira", "owner"],
      ["DadosFiscaisProfissional", "owner"], ["Usuarios", "id_user"],
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

async function baixar(ctx, consulta) {
  const r = await ctx.request.get(`${BASE}/api/notas-fiscais/download?${consulta}`);
  const cd = r.headers()["content-disposition"] ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const ascii = /filename="([^"]*)"/.exec(cd);
  return {
    status: r.status(),
    tipo: r.headers()["content-type"],
    origemPdf: r.headers()["x-nfse-pdf-origem"],
    nome: utf8 ? decodeURIComponent(utf8[1]) : null,
    nomeAscii: ascii ? ascii[1] : null,
    corpo: await r.body(),
  };
}

await new Promise((r) => servidor.listen(FAKE_PORT, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  await semear();
  anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  falha(await anon.auth.signInWithPassword({ email, password: senha }));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  ok("login do profissional descartável", !page.url().includes("/login"), page.url());

  // --- Cadastro do paciente: flag "Não imprimir na nota fiscal"
  const campo = 'input[name="nao_imprimir_na_nota"]';
  await page.goto(`${BASE}/pacientes/${pac.joao}/editar`);
  ok("form: paciente marcado no banco aparece marcado", await page.locator(campo).isChecked());
  const textoDoForm = await page.locator(`form:has(${campo})`).innerText();
  ok("form: o texto da opção explica o efeito", /Não imprimir na nota fiscal/.test(textoDoForm) && /responsável financeiro/.test(textoDoForm));
  await page.goto(`${BASE}/pacientes/${pac.helena}/editar`);
  ok("form: paciente sem a flag aparece desmarcado", !(await page.locator(campo).isChecked()));
  await page.locator(campo).check();
  await page.locator('button:has-text("Salvar")').click();
  await page.waitForURL(new RegExp(`/pacientes/${pac.helena}$`), { timeout: 20000 });
  ok("form: marcar e salvar grava a flag no banco", (await flagNoBanco(pac.helena)) === true);
  await page.goto(`${BASE}/pacientes/${pac.helena}/editar`);
  ok("form: ao reabrir, a flag continua marcada", await page.locator(campo).isChecked());
  await page.locator(campo).uncheck();
  await page.locator('button:has-text("Salvar")').click();
  await page.waitForURL(new RegExp(`/pacientes/${pac.helena}$`), { timeout: 20000 });
  ok("form: desmarcar e salvar volta a flag para falso", (await flagNoBanco(pac.helena)) === false);

  // --- Emissões: A..E, uma por vez
  const cenarios = {
    A: { principal: "helena", responsavel: "marta", sessoes: [["helena", "2026-03-03"], ["helena", "2026-03-10"], ["helena", "2026-03-17"]] },
    B: { principal: "joao", responsavel: "marta", sessoes: [["joao", "2026-03-05"]] },
    C: { principal: "helena", responsavel: "marta", sessoes: [["helena", "2026-04-07"], ["pedro", "2026-04-14"]] },
    D: { principal: "helena", responsavel: "marta", sessoes: [["helena", "2026-05-07"], ["joao", "2026-05-14"]] },
    E: { principal: "maria", responsavel: "maria", sessoes: [["maria", "2026-03-12"]] },
  };
  const padrao = (datas) => `Atendimento(s) psicológico(s) em ${datas}.\n\nServiço prestado por:\n${PROF}\nCRP: ${CRP}`;
  const esperada = {
    A: `Atendimento(s) psicológico(s) em 03, 10 e 17/03/2026 Atendimento ao(à) Sr.(a):  Helena Prado Souza CPF:  529.982.247-25 Serviço prestado por: ${PROF} CRP: ${CRP}`,
    B: padrao("05/03/2026"),
    C: `Atendimento(s) psicológico(s) em 07 e 14/04/2026 Atendimento ao(à) Sr.(a):  Helena Prado Souza CPF:  529.982.247-25; Pedro Alves Neto Serviço prestado por: ${PROF} CRP: ${CRP}`,
    D: padrao("07/05/2026 e 14/05/2026"),
    E: padrao("12/03/2026"),
  };
  const rotulo = {
    A: "A (responsável + paciente sem flag)",
    B: "B (responsável + paciente COM flag)",
    C: "C (cobrança conjunta, nenhum com flag)",
    D: "D (cobrança conjunta, um com flag)",
    E: "E (nota no nome do próprio paciente)",
  };
  let n = 0;
  for (const chave of Object.keys(cenarios)) {
    const id = await novaCobranca(chave, cenarios[chave]);
    await receber(page, id, PAGAMENTO);
    await page.click('button:has-text("Emitir nota")');
    n += 1;
    const chegou = await aguardarCaptura(n);
    ok(`${rotulo[chave]}: o serviço recebeu a emissão`, chegou);
    ok(`${rotulo[chave]}: descrição exata`, capturas[n - 1]?.descricao_servico === esperada[chave], JSON.stringify(capturas[n - 1]?.descricao_servico));
  }
  ok("A: tomador é o responsável financeiro", capturas[0]?.tomador?.nome === "Marta Alves Souza", capturas[0]?.tomador?.nome);
  ok("E: tomador é a própria paciente", capturas[4]?.tomador?.nome === "Maria Souza", capturas[4]?.tomador?.nome);
  ok("B (flag): a descrição não tem o nome nem o CPF do paciente", !/João|111\.444|11144477735/.test(String(capturas[1]?.descricao_servico)));
  ok("D (um com flag): nenhum dos dois pacientes aparece", !/Helena|João|529\.982/.test(String(capturas[3]?.descricao_servico)));
  ok("nenhuma descrição enviada tem quebra de linha onde o modelo pede uma linha só", !/\n/.test(String(capturas[0]?.descricao_servico)) && !/\n/.test(String(capturas[2]?.descricao_servico)));

  await espera(1500);
  const notas = {};
  for (const chave of Object.keys(cenarios)) notas[chave] = await notaDaCobranca(cobranca[chave]);
  ok("as 5 notas ficaram autorizadas", Object.values(notas).every((x) => x?.status === "autorizada"), JSON.stringify(Object.values(notas).map((x) => x?.status)));

  // --- Download: nome dos arquivos
  const nomes = {
    A: (num, ext) => `Marta - Helena - pg ${PG} at março 2026 - NFSe-1-${num}.${ext}`,
    B: (num, ext) => `Marta - João - pg ${PG} at março 2026 - NFSe-1-${num}.${ext}`,
    C: (num, ext) => `Marta - Helena e Pedro - pg ${PG} at abril 2026 - NFSe-1-${num}.${ext}`,
    D: (num, ext) => `Marta - Helena e João - pg ${PG} at maio 2026 - NFSe-1-${num}.${ext}`,
    E: (num, ext) => `Maria - pg ${PG} at março 2026 - NFSe-1-${num}.${ext}`,
  };
  const txt = {
    A: "A (responsável - paciente)",
    B: "B (paciente com flag: o nome do arquivo mantém o paciente)",
    C: "C (cobrança conjunta: Helena e Pedro)",
    D: "D (cobrança conjunta: Helena e João)",
    E: "E (próprio paciente: nome uma vez só)",
  };
  for (const chave of Object.keys(cenarios)) {
    const nota = notas[chave];
    const xml = await baixar(ctx, `id=${nota.id}&formato=xml`);
    ok(`nome do XML — ${txt[chave]}`, xml.status === 200 && xml.nome === nomes[chave](nota.numero, "xml"), `${xml.status} ${xml.nome}`);
  }
  const pdfA = await baixar(ctx, `id=${notas.A.id}&formato=pdf`);
  ok("nome do PDF — A, desenhado na hora", pdfA.status === 200 && pdfA.tipo === "application/pdf" && pdfA.origemPdf === "gerado" && pdfA.nome === nomes.A(notas.A.numero, "pdf"), `${pdfA.status} ${pdfA.origemPdf} ${pdfA.nome}`);
  const xmlA = await baixar(ctx, `id=${notas.A.id}&formato=xml`);
  ok("cabeçalho tem filename ASCII de reserva (sem acento) e filename* em UTF-8", xmlA.nomeAscii === nomes.A(notas.A.numero, "xml").replace("março", "marco"), xmlA.nomeAscii);

  const zipUma = await baixar(ctx, `id=${notas.A.id}&formato=todos`);
  ok(
    "ZIP de uma nota: nome do zip e dos arquivos dentro seguem o padrão",
    zipUma.nome === nomes.A(notas.A.numero, "zip") &&
      nomesNoZip(zipUma.corpo).sort().join("|") === [nomes.A(notas.A.numero, "pdf"), nomes.A(notas.A.numero, "xml")].sort().join("|"),
    `${zipUma.nome} -> ${nomesNoZip(zipUma.corpo).join(" | ")}`,
  );
  const zipVarias = await baixar(ctx, `id=${notas.A.id}&id=${notas.B.id}&formato=todos`);
  const esperadosZip = [nomes.A(notas.A.numero, "pdf"), nomes.A(notas.A.numero, "xml"), nomes.B(notas.B.numero, "pdf"), nomes.B(notas.B.numero, "xml")];
  ok(
    "ZIP em bloco: cada arquivo leva o próprio padrão",
    /^notas-fiscais-\d{4}-\d{2}-\d{2}\.zip$/.test(zipVarias.nome ?? "") && nomesNoZip(zipVarias.corpo).sort().join("|") === esperadosZip.sort().join("|"),
    `${zipVarias.nome} -> ${nomesNoZip(zipVarias.corpo).join(" | ")}`,
  );

  // --- Pela interface: o clique no link baixa o arquivo com o nome novo
  await page.goto(`${BASE}/notas-fiscais`);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator(`a[href="/api/notas-fiscais/download?id=${notas.C.id}&formato=xml"]`).first().click(),
  ]);
  ok("pela tela, o clique em XML baixa com o nome do padrão", dl.suggestedFilename() === nomes.C(notas.C.numero, "xml"), dl.suggestedFilename());

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
