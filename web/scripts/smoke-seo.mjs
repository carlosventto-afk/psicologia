// Smoke test do SEO técnico (robots, sitemaps, canonical, noindex, dados estruturados, blog, RSS,
// imagens de compartilhamento e ícones) contra um preview standalone no ar. Só faz GET e só lê dados
// públicos; manda o cabeçalho Host de cada site para exercitar o roteamento por host do proxy, e NUNCA
// abre /ir/<id> (essa rota registra um contato do diretório e redireciona para o WhatsApp).
//
// O build precisa ter as URLs públicas de produção, e o preview deve rodar com uma chave de serviço
// inválida para o proxy não gravar visitas na VisitaPagina de produção:
//   NEXT_PUBLIC_SITE_URL=https://psiagente.com.br NEXT_PUBLIC_BLOG_URL=https://blog.psiagente.com.br \
//   NEXT_PUBLIC_BUSCA_URL=https://busca.psiagente.com.br npm run build
//   (copiar public/ e .next/static para dentro de .next/standalone)
//   PORT=3100 HOSTNAME=localhost SUPABASE_SERVICE_ROLE_KEY=invalida \
//     node --env-file=.env.local .next/standalone/server.js
//   BASE=http://localhost:3100 node scripts/smoke-seo.mjs
//
// HOSTNAME=localhost (e não 127.0.0.1) importa: o Next monta a URL interna do proxy com esse valor, e
// com 127.0.0.1 a regravação de blog./busca./comece. vira "externa" e o proxy roda de novo com
// Host: localhost, o que faz o robots.txt sair igual em todos os hosts e o smoke falhar sem haver
// defeito no código. A produção usa HOSTNAME=0.0.0.0 e não sofre disso.
import http from "node:http";

const BASE = new URL(process.env.BASE ?? "http://localhost:3100");
const SITE_HOST = "psiagente.com.br";
const BLOG_HOST = "blog.psiagente.com.br";
const BUSCA_HOST = "busca.psiagente.com.br";
const COMECE_HOST = "comece.psiagente.com.br";
const SITE = `https://${SITE_HOST}`;
const BLOG = `https://${BLOG_HOST}`;
const BUSCA = `https://${BUSCA_HOST}`;

let falhas = 0;
const ok = (nome, cond, detalhe = "") => {
  if (!cond) falhas += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

function requisitar(host, caminho) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: BASE.hostname,
        port: BASE.port,
        path: caminho,
        method: "GET",
        headers: { Host: host, "User-Agent": "smoke-seo", Accept: "*/*" },
      },
      (res) => {
        const partes = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => {
          const corpo = Buffer.concat(partes);
          resolve({ status: res.statusCode, headers: res.headers, corpo, texto: corpo.toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const decodificar = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

// <meta> e <link> do HTML como objetos { nome: valor }.
function tagsDoHead(html) {
  return [...html.matchAll(/<(meta|link)\s[^>]*>/g)].map((m) => {
    const atributos = { _tag: m[1] };
    for (const a of m[0].matchAll(/([\w:-]+)="([^"]*)"/g)) atributos[a[1]] = decodificar(a[2]);
    return atributos;
  });
}
const meta = (tags, chave, valor) =>
  tags.find((t) => t._tag === "meta" && (t.name === chave || t.property === chave))?.[valor ?? "content"];
const link = (tags, rel, tipo) => tags.find((t) => t._tag === "link" && t.rel === rel && (!tipo || t.type === tipo))?.href;
const titulo = (html) => decodificar(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}
const noGrafo = (blocos, tipo) => {
  for (const bloco of blocos) {
    const itens = bloco["@graph"] ?? [bloco];
    const achado = itens.find((i) => i["@type"] === tipo);
    if (achado) return achado;
  }
  return undefined;
};

const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => decodificar(m[1]));
const ehPng = (r) => r.corpo.length > 24 && r.corpo.subarray(0, 4).toString("hex") === "89504e47";
const dimensoesPng = (r) => [r.corpo.readUInt32BE(16), r.corpo.readUInt32BE(20)];

// ------------------------------------------------------------------ www
{
  const r = await requisitar(`www.${SITE_HOST}`, "/comparativo?x=1");
  ok("www responde 308 para o domínio principal, mantendo caminho e query", r.status === 308 && r.headers.location === `${SITE}/comparativo?x=1`, r.headers.location);
}

// --------------------------------------------------------------- robots
{
  const site = await requisitar(SITE_HOST, "/robots.txt");
  ok("robots do site: bloqueia /painel e /api", site.status === 200 && /Disallow: \/painel/.test(site.texto) && /Disallow: \/api/.test(site.texto));
  ok("robots do site: NÃO bloqueia /login (o Google precisa ver o noindex)", !/Disallow: \/login/.test(site.texto));
  ok("robots do site: aponta o sitemap do site", site.texto.includes(`Sitemap: ${SITE}/sitemap.xml`));

  const blog = await requisitar(BLOG_HOST, "/robots.txt");
  ok("robots do blog: aponta o sitemap do blog e não bloqueia nada", blog.texto.includes(`Sitemap: ${BLOG}/sitemap.xml`) && !/Disallow: \/\S/.test(blog.texto));

  const busca = await requisitar(BUSCA_HOST, "/robots.txt");
  ok("robots da busca: bloqueia /ir/ e aponta o sitemap da busca", /Disallow: \/ir\//.test(busca.texto) && busca.texto.includes(`Sitemap: ${BUSCA}/sitemap.xml`));
}

// ------------------------------------------------------------- sitemaps
const sitemapSite = await requisitar(SITE_HOST, "/sitemap.xml");
const sitemapBlog = await requisitar(BLOG_HOST, "/sitemap.xml");
const sitemapBusca = await requisitar(BUSCA_HOST, "/sitemap.xml");
const urlsSite = locs(sitemapSite.texto);
const urlsBlog = locs(sitemapBlog.texto);
const urlsBusca = locs(sitemapBusca.texto);
ok("sitemap do site: home, comparativo e cadastro, só do domínio principal", sitemapSite.status === 200 && urlsSite.length === 3 && urlsSite.every((u) => u === SITE || u.startsWith(`${SITE}/`)), urlsSite.join(", "));
ok("sitemap do blog: só URLs do blog, com home, categorias e artigos", sitemapBlog.status === 200 && urlsBlog.length > 2 && urlsBlog.every((u) => u === BLOG || u.startsWith(`${BLOG}/`)) && urlsBlog.includes(BLOG) && urlsBlog.some((u) => u.includes("/categoria/")), `${urlsBlog.length} URLs`);
ok("sitemap da busca: só URLs da busca, com a home", sitemapBusca.status === 200 && urlsBusca.length >= 1 && urlsBusca.every((u) => u === BUSCA || u.startsWith(`${BUSCA}/`)) && urlsBusca.includes(BUSCA), `${urlsBusca.length} URLs`);
ok("sitemaps: cada <url> tem seu <loc> (XML íntegro)", [sitemapSite, sitemapBlog, sitemapBusca].every((r) => (r.texto.match(/<url>/g) ?? []).length === (r.texto.match(/<loc>/g) ?? []).length));
const comece404 = await requisitar(COMECE_HOST, "/sitemap.xml");
ok("comece. não tem sitemap", comece404.status === 404, String(comece404.status));

const categorias = urlsBlog.filter((u) => u.includes("/categoria/")).map((u) => u.split("/categoria/")[1]);
const artigos = urlsBlog.filter((u) => u !== BLOG && !u.includes("/categoria/")).map((u) => u.slice(BLOG.length + 1));
const perfis = urlsBusca.filter((u) => u !== BUSCA).map((u) => u.slice(BUSCA.length + 1));

// ---------------------------------------------------------- páginas do site
for (const caminho of ["/login", "/esqueci-senha", "/redefinir-senha"]) {
  const r = await requisitar(SITE_HOST, caminho);
  const tags = tagsDoHead(r.texto);
  ok(`${caminho}: fora do índice (noindex)`, r.status === 200 && /noindex/.test(meta(tags, "robots") ?? ""), `${r.status} robots=${meta(tags, "robots")}`);
}
{
  const r = await requisitar(SITE_HOST, "/cadastro?origem=home");
  const tags = tagsDoHead(r.texto);
  ok("/cadastro: indexável, título e descrição próprios, canonical sem parâmetros", r.status === 200 && !/noindex/.test(meta(tags, "robots") ?? "") && /Criar conta/.test(titulo(r.texto)) && Boolean(meta(tags, "description")) && link(tags, "canonical") === `${SITE}/cadastro`, `${titulo(r.texto)} | ${link(tags, "canonical")}`);
}
{
  const r = await requisitar(SITE_HOST, "/");
  const tags = tagsDoHead(r.texto);
  const blocos = jsonLd(r.texto);
  const org = noGrafo(blocos, "Organization");
  const site = noGrafo(blocos, "WebSite");
  ok("home: canonical absoluto no domínio principal", link(tags, "canonical") === SITE, link(tags, "canonical"));
  ok("home: Organization e WebSite em JSON-LD", Boolean(org && site) && org.url === SITE && site.url === SITE && site.publisher?.["@id"] === org["@id"]);
  ok("home: Open Graph absoluto com imagem 1200x630, nome do site e idioma", meta(tags, "og:image") === `${SITE}/og-default.png` && meta(tags, "og:site_name") === "PsiAgente" && meta(tags, "og:locale") === "pt_BR" && meta(tags, "twitter:card") === "summary_large_image", meta(tags, "og:image"));
  ok("home: ícones declarados (favicon e apple-touch-icon)", Boolean(link(tags, "icon")) && Boolean(link(tags, "apple-touch-icon")));
}
{
  const r = await requisitar(SITE_HOST, "/comparativo");
  const tags = tagsDoHead(r.texto);
  ok("/comparativo: canonical e og:url absolutos (antes saíam relativos)", link(tags, "canonical") === `${SITE}/comparativo` && meta(tags, "og:url") === `${SITE}/comparativo`, `${link(tags, "canonical")} | ${meta(tags, "og:url")}`);
}
{
  const r = await requisitar(COMECE_HOST, "/");
  const tags = tagsDoHead(r.texto);
  ok("comece.: noindex por cabeçalho e por meta", r.status === 200 && /noindex/.test(r.headers["x-robots-tag"] ?? "") && /noindex/.test(meta(tags, "robots") ?? ""), `${r.headers["x-robots-tag"]} | ${meta(tags, "robots")}`);
}

// -------------------------------------------------------------- imagens
{
  const og = await requisitar(SITE_HOST, "/og-default.png");
  ok("og-default.png: PNG 1200x630", og.status === 200 && ehPng(og) && dimensoesPng(og).join("x") === "1200x630", ehPng(og) ? dimensoesPng(og).join("x") : String(og.status));
  const logo = await requisitar(SITE_HOST, "/logo-512.png");
  ok("logo-512.png: PNG 512x512 (logo do JSON-LD)", logo.status === 200 && ehPng(logo) && dimensoesPng(logo).join("x") === "512x512");
  const fav = await requisitar(BLOG_HOST, "/favicon.ico");
  ok("favicon.ico: servido também nos subdomínios", fav.status === 200 && /icon/.test(fav.headers["content-type"] ?? "") && fav.corpo.length > 100, `${fav.status} ${fav.headers["content-type"]}`);
  const apple = await requisitar(SITE_HOST, "/apple-icon.png");
  ok("apple-icon.png: PNG 180x180", apple.status === 200 && ehPng(apple) && dimensoesPng(apple).join("x") === "180x180");
}

// ----------------------------------------------------------------- blog
{
  const r = await requisitar(BLOG_HOST, "/");
  const tags = tagsDoHead(r.texto);
  const blog = noGrafo(jsonLd(r.texto), "Blog");
  ok("blog: canonical da primeira página sem parâmetro", link(tags, "canonical") === BLOG, link(tags, "canonical"));
  ok("blog: JSON-LD Blog com publisher", blog?.url === BLOG && blog?.publisher?.name === "PsiAgente");
  ok("blog: feed RSS declarado no head", link(tags, "alternate", "application/rss+xml") === `${BLOG}/feed.xml`, link(tags, "alternate", "application/rss+xml"));
  ok("blog: Open Graph com imagem absoluta", /^https:\/\/blog\.psiagente\.com\.br\//.test(meta(tags, "og:image") ?? "") || /^https:\/\/psiagente\.com\.br\//.test(meta(tags, "og:image") ?? ""), meta(tags, "og:image"));
  // cada artigo da lista tem exatamente um <h2> (o <h1> é o título da página)
  const cartoes = (r.texto.match(/<h2[\s>]/g) ?? []).length;
  ok("blog: lista paginada (no máximo 12 artigos por página)", cartoes > 0 && cartoes <= 12, `${cartoes} artigos`);
  const proxima = /href="\/\?pagina=2"/.test(r.texto);
  const totalPaginas = Math.ceil(artigos.length / 12);
  ok("blog: link para a página 2 só existe se houver mais de uma página", proxima === totalPaginas > 1, `artigos=${artigos.length} paginas=${totalPaginas}`);

  if (totalPaginas > 1) {
    const p2 = await requisitar(BLOG_HOST, "/?pagina=2");
    const tags2 = tagsDoHead(p2.texto);
    ok("blog: página 2 com canonical próprio", p2.status === 200 && link(tags2, "canonical") === `${BLOG}/?pagina=2`, link(tags2, "canonical"));
  }
  const fora = await requisitar(BLOG_HOST, "/?pagina=999");
  ok("blog: página fora do intervalo é 404 (não duplica a lista)", fora.status === 404, String(fora.status));
  const ruim = await requisitar(BLOG_HOST, "/?pagina=abc");
  ok("blog: página mal formada é 404", ruim.status === 404, String(ruim.status));
}
if (categorias.length > 0) {
  const slug = categorias[0];
  const r = await requisitar(BLOG_HOST, `/categoria/${slug}`);
  const tags = tagsDoHead(r.texto);
  const trilha = noGrafo(jsonLd(r.texto), "BreadcrumbList");
  ok("categoria: página própria com canonical absoluto", r.status === 200 && link(tags, "canonical") === `${BLOG}/categoria/${slug}`, `${r.status} ${link(tags, "canonical")}`);
  ok("categoria: BreadcrumbList Blog > categoria", trilha?.itemListElement?.length === 2 && trilha.itemListElement[0].item === BLOG);
  const antigo = await requisitar(BLOG_HOST, `/?categoria=${slug}`);
  ok("URL antiga /?categoria=x redireciona (308) para /categoria/x", antigo.status === 308 && /\/categoria\//.test(antigo.headers.location ?? ""), `${antigo.status} ${antigo.headers.location}`);
  const inexistente = await requisitar(BLOG_HOST, "/categoria/nao-existe-xyz");
  ok("categoria inexistente é 404", inexistente.status === 404, String(inexistente.status));
}
if (artigos.length > 0) {
  const slug = artigos[0];
  const r = await requisitar(BLOG_HOST, `/${slug}`);
  const tags = tagsDoHead(r.texto);
  const blocos = jsonLd(r.texto);
  const post = noGrafo(blocos, "BlogPosting");
  const trilha = noGrafo(blocos, "BreadcrumbList");
  ok("artigo: canonical absoluto no host do blog", r.status === 200 && link(tags, "canonical") === `${BLOG}/${slug}`, link(tags, "canonical"));
  ok("artigo: BlogPosting com publisher, datas, imagem e url", Boolean(post) && post.mainEntityOfPage?.["@id"] === `${BLOG}/${slug}` && post.publisher?.name === "PsiAgente" && Boolean(post.datePublished) && Boolean(post.dateModified) && post.image?.length === 1);
  ok("artigo: BreadcrumbList Blog > artigo", trilha?.itemListElement?.[0]?.item === BLOG && trilha.itemListElement.at(-1).item === `${BLOG}/${slug}`);
  ok("artigo: Open Graph do tipo article com datas", meta(tags, "og:type") === "article" && Boolean(meta(tags, "article:published_time")) && meta(tags, "twitter:card") === "summary_large_image");
  const hrefsRelacionados = [...r.texto.matchAll(/<a\s[^>]*data-relacionado[^>]*>/g)].map((m) => /href="([^"]*)"/.exec(m[0])?.[1]);
  ok("artigo: bloco 'Leia também' com até 3 artigos, sem o próprio", hrefsRelacionados.length >= 1 && hrefsRelacionados.length <= 3 && !hrefsRelacionados.includes(`/${slug}`), hrefsRelacionados.join(", "));
  ok("artigo: categorias apontam para URLs próprias (/categoria/x)", !/href="\/\?categoria=/.test(r.texto));

  const cartao = await requisitar(BLOG_HOST, `/${slug}/imagem-compartilhamento`);
  ok("artigo: cartão de compartilhamento gerado em PNG 1200x630", cartao.status === 200 && ehPng(cartao) && dimensoesPng(cartao).join("x") === "1200x630", ehPng(cartao) ? dimensoesPng(cartao).join("x") : `${cartao.status} ${cartao.headers["content-type"]}`);
  const semCartao = await requisitar(BLOG_HOST, "/nao-existe-xyz/imagem-compartilhamento");
  ok("cartão de artigo inexistente cai na imagem padrão (nunca 500)", semCartao.status < 500, String(semCartao.status));
}
{
  const r = await requisitar(BLOG_HOST, "/feed.xml");
  const itens = (r.texto.match(/<item>/g) ?? []).length;
  ok("feed.xml: RSS 2.0 em XML, com itens e atom:link", r.status === 200 && /xml/.test(r.headers["content-type"] ?? "") && r.texto.startsWith("<?xml") && r.texto.includes('<rss version="2.0"') && itens > 0 && itens <= 30 && r.texto.includes(`<atom:link href="${BLOG}/feed.xml"`), `${itens} itens`);
  ok("feed.xml: itens com link absoluto no host do blog", [...r.texto.matchAll(/<link>([^<]*)<\/link>/g)].every((m) => m[1].startsWith(BLOG)));
}

// ---------------------------------------------------------------- busca
{
  const r = await requisitar(BUSCA_HOST, "/");
  const tags = tagsDoHead(r.texto);
  ok("busca: canonical da home sem filtros", link(tags, "canonical") === BUSCA, link(tags, "canonical"));
  ok("busca: ícones herdados do site", Boolean(link(tags, "icon")));
  const filtrada = await requisitar(BUSCA_HOST, "/?cidade=Belem&modalidade=online");
  const tf = tagsDoHead(filtrada.texto);
  ok("busca: página com filtros fica fora do índice (noindex)", filtrada.status === 200 && /noindex/.test(meta(tf, "robots") ?? ""), meta(tf, "robots"));
}
if (perfis.length > 0) {
  const slug = perfis[0];
  const r = await requisitar(BUSCA_HOST, `/${slug}`);
  const tags = tagsDoHead(r.texto);
  const pessoa = noGrafo(jsonLd(r.texto), "Person");
  ok("perfil: canonical absoluto no host da busca", r.status === 200 && link(tags, "canonical") === `${BUSCA}/${slug}`, link(tags, "canonical"));
  ok("perfil: título com 'Psicólogo(a)' e descrição própria", /Psicólogo\(a\)/.test(titulo(r.texto)) && (meta(tags, "description") ?? "").length >= 40, titulo(r.texto));
  ok("perfil: Person em JSON-LD, sem expor o contato", Boolean(pessoa) && pessoa.url === `${BUSCA}/${slug}` && !/\b55\d{10,11}\b/.test(JSON.stringify(jsonLd(r.texto))));
  ok("perfil: link /ir/ com rel=nofollow", /<a[^>]*href="\/ir\/[^"]*"[^>]*rel="[^"]*nofollow[^"]*"|<a[^>]*rel="[^"]*nofollow[^"]*"[^>]*href="\/ir\//.test(r.texto));
  ok("perfil: Open Graph com nome do site e idioma", meta(tags, "og:site_name") === "PsiAgente" && meta(tags, "og:locale") === "pt_BR");
}
{
  const r = await requisitar(BUSCA_HOST, "/perfil-que-nao-existe-xyz");
  ok("perfil inexistente é 404", r.status === 404, String(r.status));
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
