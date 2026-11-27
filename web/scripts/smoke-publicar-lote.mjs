// Smoke test da publicação em lote de /admin/artigos, com usuários e artigos descartáveis
// (criados e apagados aqui, a limpeza roda no finally).
//
// O .env.local aponta para a PRODUÇÃO e a tela lista todos os artigos, inclusive os rascunhos
// reais do pipeline de notícias. Por isso o teste só marca os artigos que ele mesmo criou e
// recusa qualquer confirmação cuja contagem não seja a esperada. Nunca use aqui "Selecionar
// todos" seguido de "Publicar". Os artigos que o teste publica ficam no ar por segundos: os de
// data antiga vão para o fim do índice do blog, e os dois de data nova são apagados logo após
// as conferências.
//
// Preview standalone no ar (chave de serviço inválida, para o proxy não gravar visitas) e o
// script com o .env.local carregado:
//   BASE=http://localhost:3100 node --env-file=.env.local scripts/smoke-publicar-lote.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { publicarRascunhos, executarPublicacaoEmLote } from "../lib/publicacao-lote.js";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./.smoke";
mkdirSync(OUT, { recursive: true });
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_SUPABASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suf = String(Date.now()).slice(-7);
const senha = `Smoke-${suf}-Xy!`;
const prefixo = `smoke-lote-${suf}`;
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
const artigos = {}; // chave -> { id, titulo, slug }

async function criarConta(papel, extra = {}) {
  const email = `smoke-lote-${papel}-${suf}@example.invalid`;
  const u = dado(await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }));
  contas[papel] = { id: u.user.id, email }; // registrado antes do resto, para a limpeza achar
  dado(
    await admin.from("Usuarios").insert({
      id_user: u.user.id,
      nome: `Smoke ${papel}`,
      email,
      contato: Number(`119${suf}${Object.keys(contas).length}`),
      role: papel === "admin" ? "admin" : "psicologo",
      aprovado: true,
      plano: "gratis",
      crp_conferido: true,
      ...extra,
    })
  );
}

// minutosAtras ordena a lista (criado_em desc) e deixa os artigos do teste no topo.
async function semear(chave, minutosAtras, extra = {}) {
  const criado = new Date(Date.now() - minutosAtras * 60000).toISOString();
  const linha = dado(
    await admin
      .from("artigos")
      .insert({
        titulo: `Smoke lote ${suf} ${chave}`,
        slug: `${prefixo}-${chave.toLowerCase()}`,
        conteudo: "Texto fictício do teste de publicação em lote.",
        autor: "Smoke",
        publicado: false,
        publicado_em: null,
        criado_em: criado,
        ...extra,
      })
      .select("id, titulo, slug")
      .single()
  );
  artigos[chave] = linha;
}

async function entrar(browser, papel, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', contas[papel].email);
  await page.fill('input[name="senha"]', senha);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  return { ctx, page };
}

async function limpar() {
  try {
    const ids = Object.values(artigos).map((a) => a.id);
    if (ids.length) dado(await admin.from("artigos").delete().in("id", ids));
    // Rede de segurança: só o prefixo deste teste.
    dado(await admin.from("artigos").delete().like("slug", `${prefixo}-%`));
    const sobra = dado(await admin.from("artigos").select("id").like("slug", `${prefixo}-%`));
    console.log(sobra.length ? `ATENÇÃO: sobraram ${sobra.length} artigos de teste` : "Artigos de teste apagados.");

    for (const c of Object.values(contas)) {
      await admin.from("Lead").delete().eq("email", c.email); // lead automático de cadastro (se houver)
      const { data: u } = await admin.from("Usuarios").select("id").eq("id_user", c.id).maybeSingle();
      if (u) await admin.from("EventoAssinatura").delete().eq("usuario", u.id);
      await admin.from("Usuarios").delete().eq("id_user", c.id);
      for (let i = 0; i < 3; i++) {
        await admin.auth.admin.deleteUser(c.id);
        const { data } = await admin.auth.admin.getUserById(c.id);
        if (!data?.user) break;
      }
    }
    console.log("Limpeza concluída.");
  } catch (e) {
    console.error("ERRO NA LIMPEZA — conferir manualmente:", e.message, { contas, artigos });
  }
}

// Cliente do Supabase na sessão (JWT) de uma conta de teste: o RLS vale como no app.
async function clienteDe(papel) {
  const c = createClient(URL_SUPABASE, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  dado(await c.auth.signInWithPassword({ email: contas[papel].email, password: senha }));
  return c;
}

const linhaDe = async (chave) =>
  dado(
    await admin
      .from("artigos")
      .select("id, publicado, publicado_em, atualizado_em, criado_em")
      .eq("id", artigos[chave].id)
      .single()
  );

const linhaNaTela = (page, chave) => page.locator("div.card", { hasText: artigos[chave].titulo }).first();
const caixa = (page, chave) => linhaNaTela(page, chave).locator('input[type="checkbox"]');
const barra = (page) => page.locator("div.card", { hasText: "Selecionar todos os rascunhos" }).first();
const botaoPublicar = (page) => page.getByRole("button", { name: /Publicar selecionados|Publicando/ });
const marcarTodos = (page) => page.getByLabel(/Selecionar todos os rascunhos/);

// Responde ao confirm(): só aceita se a mensagem for a esperada, senão cancela e acusa.
function responderConfirm(page, { esperado, aceitar }) {
  return new Promise((resolve) => {
    page.once("dialog", async (d) => {
      const mensagem = d.message();
      const confere = esperado.test(mensagem);
      if (confere && aceitar) await d.accept();
      else await d.dismiss();
      resolve({ mensagem, confere, aceito: confere && aceitar });
    });
  });
}

const browser = await chromium.launch();
try {
  await criarConta("admin");
  await criarConta("criador", { criador_conteudo: true });
  await criarConta("prof");

  // Datas de 2001: o que o teste publica com data antiga cai no fim do índice do blog.
  await semear("A1", 30); // rascunho, sem data de publicação (o mais antigo dos dois)
  await semear("A2", 20); // rascunho, sem data de publicação (o mais novo)
  await semear("CTRL", 10); // rascunho que ninguém marca
  await semear("PUB", 60, { publicado: true, publicado_em: "2001-01-03T00:00:00+00:00" });
  await semear("C1", 40, { publicado_em: "2001-01-02T00:00:00+00:00" }); // rascunho que já foi publicado antes
  await semear("C2", 50); // rascunho para as conferências de RLS

  // ===== Banco: o RLS devolve zero linhas, sem erro, para quem não pode escrever (premissa do código) =====
  {
    const prof = await clienteDe("prof");
    const tentativa = await prof.from("artigos").update({ publicado: true }).eq("id", artigos.C2.id).select("id");
    ok(
      "premissa: update de quem nao pode (RLS) nao da erro e nao altera linha",
      tentativa.error === null && Array.isArray(tentativa.data) && tentativa.data.length === 0,
      JSON.stringify(tentativa)
    );
    ok("premissa: o rascunho continua rascunho", (await linhaDe("C2")).publicado === false);

    const lote = await publicarRascunhos(prof, [artigos.C2.id]);
    ok(
      "publicarRascunhos com a sessao de psicologo comum nao publica nada (RLS esconde o rascunho)",
      lote.publicados.length === 0 && lote.ignorados === 1 && (await linhaDe("C2")).publicado === false,
      JSON.stringify({ publicados: lote.publicados.length, ignorados: lote.ignorados })
    );

    const { data: perfil } = await admin.from("Usuarios").select("role, criador_conteudo").eq("id_user", contas.prof.id).single();
    const negado = await executarPublicacaoEmLote({ supabase: prof, usuario: perfil, ids: [artigos.C2.id] });
    ok("executarPublicacaoEmLote nega a permissao ao psicologo comum", /permissão/.test(negado.resposta.error ?? "") && !negado.publicou);
  }

  // ===== Tela como admin =====
  {
    const { ctx, page } = await entrar(browser, "admin");
    let acoesPost = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) acoesPost++;
    });

    await page.goto(`${BASE}/admin/artigos`);
    await linhaNaTela(page, "A1").waitFor();

    ok("rascunho tem checkbox", (await caixa(page, "A1").count()) === 1);
    ok("artigo publicado nao tem checkbox", (await caixa(page, "PUB").count()) === 0);
    ok("rascunho aparece como Rascunho, publicado como Publicado",
      (await linhaNaTela(page, "A1").innerText()).includes("Rascunho ·") &&
        (await linhaNaTela(page, "PUB").innerText()).includes("Publicado ·"));
    ok("botao de publicar comeca desabilitado", await botaoPublicar(page).isDisabled());

    // selecionar todos: so liga e desliga, nunca publica
    const rotulo = await barra(page).innerText();
    const totalRascunhos = Number((rotulo.match(/rascunhos \((\d+)\)/) ?? [])[1]);
    ok("rotulo de selecionar todos traz a quantidade de rascunhos (>= 4 do teste)", totalRascunhos >= 4, String(totalRascunhos));
    await marcarTodos(page).check();
    ok("selecionar todos marca todos os rascunhos e mostra a contagem",
      (await caixa(page, "A1").isChecked()) &&
        (await caixa(page, "CTRL").isChecked()) &&
        (await barra(page).innerText()).includes(`${totalRascunhos} artigos selecionados`));
    await marcarTodos(page).uncheck();
    ok("desmarcar todos limpa a selecao", !(await caixa(page, "A1").isChecked()) && (await barra(page).innerText()).includes("Nenhum selecionado"));

    // seleção individual e estado intermediário do "selecionar todos"
    await caixa(page, "A1").check();
    ok("um marcado: contagem no singular e 'selecionar todos' fica intermediario",
      (await barra(page).innerText()).includes("1 artigo selecionado") &&
        (await marcarTodos(page).evaluate((el) => el.indeterminate)) === true &&
        !(await botaoPublicar(page).isDisabled()));
    await caixa(page, "A1").uncheck();

    await page.screenshot({ path: `${OUT}/publicar-lote-desktop.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });

    // cancelar o confirm não publica nem chama a action
    await caixa(page, "CTRL").check();
    const postsAntes = acoesPost;
    const cancelado = responderConfirm(page, { esperado: /^Publicar 1 artigo agora\? Ele fica público no blog na hora\.$/, aceitar: false });
    await botaoPublicar(page).click();
    const rCancelado = await cancelado;
    await page.waitForTimeout(800);
    ok("confirm de 1 artigo traz a mensagem no singular", rCancelado.confere, rCancelado.mensagem);
    ok("cancelar o confirm nao chama a action e nao publica",
      acoesPost === postsAntes && (await linhaDe("CTRL")).publicado === false && (await caixa(page, "CTRL").isChecked()));

    // falha de rede: mensagem geral, nada publicado, seleção mantida, botão volta
    await page.route("**/admin/artigos", (route) =>
      route.request().method() === "POST" ? route.abort("failed") : route.continue()
    );
    const aceitoRede = responderConfirm(page, { esperado: /^Publicar 1 artigo agora\?/, aceitar: true });
    await botaoPublicar(page).click();
    await aceitoRede;
    await page.getByText(/Não foi possível publicar agora/).waitFor({ timeout: 10000 });
    ok("falha de rede mostra o erro geral, nao publica, mantem a selecao e reabilita o botao",
      (await linhaDe("CTRL")).publicado === false &&
        (await caixa(page, "CTRL").isChecked()) &&
        !(await botaoPublicar(page).isDisabled()));
    await page.unroute("**/admin/artigos");
    await caixa(page, "CTRL").uncheck();

    // celular: sem rolagem horizontal e a barra quebra linha
    await page.setViewportSize({ width: 375, height: 800 });
    await caixa(page, "A1").check();
    await page.waitForTimeout(300);
    const largura = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: document.documentElement.clientWidth }));
    ok("375px: sem rolagem horizontal", largura.rolagem <= largura.janela, JSON.stringify(largura));
    await page.screenshot({ path: `${OUT}/publicar-lote-375.png`, clip: { x: 0, y: 0, width: 375, height: 640 } });
    await caixa(page, "A1").uncheck();
    await page.setViewportSize({ width: 1280, height: 900 });

    // publicar A1 e A2 (e só eles), com a action devagar para ver o estado "Publicando..."
    await caixa(page, "A1").check();
    await caixa(page, "A2").check();
    ok("dois marcados: contagem no plural", (await barra(page).innerText()).includes("2 artigos selecionados"));
    await page.route("**/admin/artigos", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const aceito = responderConfirm(page, { esperado: /^Publicar 2 artigos agora\? Eles ficam públicos no blog na hora\.$/, aceitar: true });
    await botaoPublicar(page).click();
    const rAceito = await aceito;
    ok("confirm de 2 artigos traz a mensagem no plural e foi aceito", rAceito.aceito, rAceito.mensagem);
    await page.getByRole("button", { name: "Publicando..." }).waitFor({ timeout: 3000 });
    ok("durante a publicacao o botao mostra 'Publicando...' e os checkboxes ficam desabilitados",
      (await botaoPublicar(page).isDisabled()) && (await caixa(page, "A1").isDisabled()) && (await marcarTodos(page).isDisabled()));
    await page.getByText("2 artigos publicados.").waitFor({ timeout: 15000 });
    await page.unroute("**/admin/artigos");

    ok("depois de publicar, A1 e A2 aparecem como Publicado e sem checkbox",
      (await linhaNaTela(page, "A1").innerText()).includes("Publicado ·") &&
        (await linhaNaTela(page, "A2").innerText()).includes("Publicado ·") &&
        (await caixa(page, "A1").count()) === 0 &&
        (await caixa(page, "A2").count()) === 0);
    ok("a selecao foi limpa e o resto da lista continua intacto",
      (await barra(page).innerText()).includes("Nenhum selecionado") &&
        (await linhaNaTela(page, "CTRL").innerText()).includes("Rascunho ·") &&
        (await caixa(page, "CTRL").count()) === 1);

    const [a1, a2, ctrl, pub] = await Promise.all([linhaDe("A1"), linhaDe("A2"), linhaDe("CTRL"), linhaDe("PUB")]);
    ok("banco: A1 e A2 publicados, com data de publicacao", a1.publicado && a2.publicado && a1.publicado_em && a2.publicado_em);
    ok("banco: o mais novo (A2) tem data de publicacao posterior a do mais antigo (A1)", Date.parse(a2.publicado_em) > Date.parse(a1.publicado_em), `${a1.publicado_em} < ${a2.publicado_em}`);
    ok("banco: atualizado_em igual nos dois e nunca antes de publicado_em",
      a1.atualizado_em === a2.atualizado_em &&
        Date.parse(a1.atualizado_em) >= Date.parse(a2.publicado_em) &&
        Date.parse(a2.publicado_em) <= Date.now());
    ok("banco: o rascunho de controle e o artigo ja publicado nao foram tocados",
      ctrl.publicado === false && ctrl.publicado_em === null && pub.publicado === true && pub.publicado_em === "2001-01-03T00:00:00+00:00");

    const ordem = dado(
      await admin
        .from("artigos")
        .select("id")
        .in("id", [artigos.A1.id, artigos.A2.id])
        .order("publicado_em", { ascending: false })
        .order("id", { ascending: false })
    ).map((l) => l.id);
    ok("ordem do blog (publicado_em desc): o mais novo fica no topo", ordem[0] === artigos.A2.id && ordem[1] === artigos.A1.id);

    // não deixa os dois no ar mais do que o necessário
    dado(await admin.from("artigos").delete().in("id", [artigos.A1.id, artigos.A2.id]));
    delete artigos.A1;
    delete artigos.A2;
    await ctx.close();
  }

  // ===== Quem não é admin nem criador de conteúdo não chega na tela =====
  {
    const { ctx, page } = await entrar(browser, "prof");
    await page.goto(`${BASE}/admin/artigos`);
    ok("psicologo comum e mandado para fora de /admin/artigos", !new URL(page.url()).pathname.startsWith("/admin"), page.url());
    await ctx.close();
  }

  // ===== Criador de conteúdo publica pela tela; rascunho que já foi publicado mantém a data =====
  {
    const { ctx, page } = await entrar(browser, "criador");
    await page.goto(`${BASE}/admin/artigos`);
    await linhaNaTela(page, "C1").waitFor();
    await caixa(page, "C1").check();
    const aceito = responderConfirm(page, { esperado: /^Publicar 1 artigo agora\?/, aceitar: true });
    await botaoPublicar(page).click();
    await aceito;
    await page.getByText("1 artigo publicado.").waitFor({ timeout: 15000 });
    const c1 = await linhaDe("C1");
    ok("criador de conteudo publica pela tela", c1.publicado === true);
    ok("rascunho que ja foi publicado mantem a data original", c1.publicado_em === "2001-01-02T00:00:00+00:00", c1.publicado_em);
    ok("atualizado_em foi renovado", Date.now() - Date.parse(c1.atualizado_em) < 120000, c1.atualizado_em);
    await ctx.close();
  }
} catch (e) {
  ok("execucao sem excecao", false, e.stack ?? e.message);
} finally {
  await browser.close();
  await limpar();
}

const falhas = relatorio.filter((r) => !r.ok);
console.log(`\n${relatorio.length - falhas.length}/${relatorio.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
