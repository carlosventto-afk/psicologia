import test from "node:test";
import assert from "node:assert/strict";
import {
  origens,
  PREFIXOS_PRIVADOS,
  robotsParaHost,
  sitemapSite,
  sitemapBlog,
  sitemapBusca,
  descricaoCurta,
  escaparXml,
  montarRss,
  serializarJsonLd,
  jsonLdHome,
  jsonLdArtigo,
  jsonLdBreadcrumb,
  jsonLdBlog,
  jsonLdPerfil,
  tituloPerfil,
  descricaoPerfil,
  montarCompartilhamento,
  IMAGEM_PADRAO,
  alternativasBlog,
  imagemDoArtigo,
} from "./seo.js";

const O = origens({
  site: "https://psiagente.com.br/",
  blog: "https://blog.psiagente.com.br",
  busca: "https://busca.psiagente.com.br/",
});

// ---------------------------------------------------------------- origens

test("origens: tira a barra final", () => {
  assert.deepEqual(O, {
    site: "https://psiagente.com.br",
    blog: "https://blog.psiagente.com.br",
    busca: "https://busca.psiagente.com.br",
  });
});

test("origens: sem variavel de ambiente usa o dominio de producao (nunca localhost)", () => {
  assert.deepEqual(origens({ site: undefined, blog: "", busca: "  " }), {
    site: "https://psiagente.com.br",
    blog: "https://blog.psiagente.com.br",
    busca: "https://busca.psiagente.com.br",
  });
});

// ----------------------------------------------------------------- robots

test("robots do blog: libera tudo e aponta o proprio sitemap", () => {
  assert.deepEqual(robotsParaHost("blog.psiagente.com.br", O), {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://blog.psiagente.com.br/sitemap.xml",
  });
});

test("robots da busca: bloqueia /ir/ (a rota registra contato e redireciona)", () => {
  const r = robotsParaHost("busca.psiagente.com.br", O);
  assert.deepEqual(r.rules, [{ userAgent: "*", allow: "/", disallow: ["/ir/"] }]);
  assert.equal(r.sitemap, "https://busca.psiagente.com.br/sitemap.xml");
});

test("robots do site: bloqueia as areas privadas e aponta o sitemap do site", () => {
  const r = robotsParaHost("psiagente.com.br", O);
  assert.equal(r.sitemap, "https://psiagente.com.br/sitemap.xml");
  const { disallow } = r.rules[0];
  for (const caminho of ["/painel", "/api", "/admin", "/pacientes", "/auth", "/completar-cadastro"]) {
    assert.ok(disallow.includes(caminho), `faltou bloquear ${caminho}`);
  }
});

test("robots do site: nao bloqueia o que precisa mostrar o noindex ao Google (login e recuperacao)", () => {
  const { disallow } = robotsParaHost("psiagente.com.br", O).rules[0];
  for (const caminho of ["/login", "/esqueci-senha", "/redefinir-senha", "/cadastro", "/termos", "/comparativo"]) {
    assert.ok(!disallow.includes(caminho), `nao devia bloquear ${caminho}`);
  }
});

test("robots: www e host desconhecido seguem as regras do site principal", () => {
  assert.deepEqual(robotsParaHost("www.psiagente.com.br", O), robotsParaHost("psiagente.com.br", O));
  assert.deepEqual(robotsParaHost("qualquer.coisa", O), robotsParaHost("psiagente.com.br", O));
  assert.deepEqual(robotsParaHost(undefined, O), robotsParaHost("psiagente.com.br", O));
});

test("robots do comece: sem sitemap e sem bloqueio (a saida do indice e via noindex)", () => {
  assert.deepEqual(robotsParaHost("comece.psiagente.com.br", O), {
    rules: [{ userAgent: "*", allow: "/" }],
  });
});

test("PREFIXOS_PRIVADOS nao bloqueia nenhuma URL do sitemap do site", () => {
  for (const { url } of sitemapSite(O)) {
    const caminho = new URL(url).pathname;
    for (const prefixo of PREFIXOS_PRIVADOS) {
      assert.ok(!caminho.startsWith(prefixo), `${caminho} cairia no bloqueio ${prefixo}`);
    }
  }
});

// ---------------------------------------------------------------- sitemaps

const artigos = [
  {
    slug: "ansiedade",
    titulo: "Ansiedade",
    publicado_em: "2026-10-22T10:00:00Z",
    atualizado_em: "2026-11-01T10:00:00Z",
    categorias: [{ nome: "Ansiedade", slug: "ansiedade" }],
  },
  {
    slug: "luto",
    titulo: "Luto",
    publicado_em: "2026-10-10T10:00:00Z",
    atualizado_em: null,
    categorias: [
      { nome: "Luto", slug: "luto" },
      { nome: "Ansiedade", slug: "ansiedade" },
    ],
  },
  {
    slug: "estresse",
    titulo: "Estresse",
    publicado_em: "2026-10-05T10:00:00Z",
    categorias: [{ nome: "Ansiedade", slug: "ansiedade" }],
  },
  {
    slug: "perda",
    titulo: "Perda",
    publicado_em: "2026-10-04T10:00:00Z",
    categorias: [{ nome: "Luto", slug: "luto" }],
  },
  { slug: "sem-categoria", titulo: "Sem", publicado_em: "2026-09-01T10:00:00Z", categorias: [] },
];

test("sitemap do site: home, comparativo e cadastro, sem data inventada", () => {
  const s = sitemapSite(O);
  assert.deepEqual(
    s.map((e) => e.url),
    ["https://psiagente.com.br", "https://psiagente.com.br/comparativo", "https://psiagente.com.br/cadastro"],
  );
  for (const e of s) assert.equal(e.lastModified, undefined);
});

test("sitemap do blog: home, categorias com 3+ artigos e artigos — so URLs do host do blog", () => {
  const s = sitemapBlog(artigos, O);
  assert.deepEqual(
    s.map((e) => e.url),
    [
      "https://blog.psiagente.com.br",
      // "luto" tem so 2 artigos: pagina fina, fica de fora do sitemap
      "https://blog.psiagente.com.br/categoria/ansiedade",
      "https://blog.psiagente.com.br/ansiedade",
      "https://blog.psiagente.com.br/luto",
      "https://blog.psiagente.com.br/estresse",
      "https://blog.psiagente.com.br/perda",
      "https://blog.psiagente.com.br/sem-categoria",
    ],
  );
});

test("sitemap do blog: lastModified real (atualizado_em ou, sem ele, publicado_em)", () => {
  const s = sitemapBlog(artigos, O);
  const por = Object.fromEntries(s.map((e) => [e.url, e.lastModified]));
  assert.equal(por["https://blog.psiagente.com.br/ansiedade"], "2026-11-01T10:00:00.000Z");
  assert.equal(por["https://blog.psiagente.com.br/luto"], "2026-10-10T10:00:00.000Z");
  assert.equal(por["https://blog.psiagente.com.br/sem-categoria"], "2026-09-01T10:00:00.000Z");
  // home e categorias: data do artigo mais recente que elas listam
  assert.equal(por["https://blog.psiagente.com.br"], "2026-11-01T10:00:00.000Z");
  assert.equal(por["https://blog.psiagente.com.br/categoria/ansiedade"], "2026-11-01T10:00:00.000Z");
});

test("sitemap do blog: sem artigos so a home, sem data", () => {
  const s = sitemapBlog([], O);
  assert.deepEqual(s.map((e) => e.url), ["https://blog.psiagente.com.br"]);
  assert.equal(s[0].lastModified, undefined);
});

test("sitemap da busca: home e um perfil por slug", () => {
  const s = sitemapBusca([{ slug: "marta-lima" }, { slug: "paulo-reis" }], O);
  assert.deepEqual(
    s.map((e) => e.url),
    [
      "https://busca.psiagente.com.br",
      "https://busca.psiagente.com.br/marta-lima",
      "https://busca.psiagente.com.br/paulo-reis",
    ],
  );
});

// ---------------------------------------------------------- descricaoCurta

test("descricaoCurta: tira markdown e junta espacos", () => {
  const md =
    "# Titulo\n\nTexto com **negrito**, _italico_ e [um link](https://x.com/a).\n\n![img](a.png)\n\n- item um\n- item dois";
  assert.equal(descricaoCurta(md, 200), "Titulo Texto com negrito, italico e um link. item um item dois");
});

test("descricaoCurta: corta na palavra e poe reticencias", () => {
  assert.equal(descricaoCurta("um dois tres quatro cinco seis", 16), "um dois tres…");
});

test("descricaoCurta: texto que cabe volta inteiro", () => {
  assert.equal(descricaoCurta("curto e bom", 160), "curto e bom");
});

test("descricaoCurta: vazio ou so imagem vira undefined", () => {
  assert.equal(descricaoCurta(null), undefined);
  assert.equal(descricaoCurta(""), undefined);
  assert.equal(descricaoCurta("   \n  "), undefined);
  assert.equal(descricaoCurta("![x](y.png)"), undefined);
});

// ---------------------------------------------------------------- RSS / XML

test("escaparXml: escapa os cinco caracteres e remove controles invalidos", () => {
  assert.equal(escaparXml(`a & b < c > "d" 'e'`), "a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
  assert.equal(escaparXml("a\u0000b\u0008c"), "abc");
  assert.equal(escaparXml(null), "");
});

test("montarRss: RSS 2.0 valido com escape, data RFC 822 e guid permanente", () => {
  const xml = montarRss({
    titulo: "Blog PsiAgente",
    descricao: "Artigos & dicas",
    link: "https://blog.psiagente.com.br",
    linkFeed: "https://blog.psiagente.com.br/feed.xml",
    artigos: [
      {
        titulo: "Ansiedade <hoje>",
        url: "https://blog.psiagente.com.br/ansiedade",
        resumo: "Resumo & mais",
        publicadoEm: "2026-10-22T10:00:00Z",
        categorias: ["Ansiedade"],
      },
    ],
  });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(
    xml,
    /<atom:link href="https:\/\/blog\.psiagente\.com\.br\/feed\.xml" rel="self" type="application\/rss\+xml"\/>/,
  );
  assert.match(xml, /<language>pt-BR<\/language>/);
  assert.match(xml, /<title>Ansiedade &lt;hoje&gt;<\/title>/);
  assert.match(xml, /<description>Resumo &amp; mais<\/description>/);
  assert.match(xml, /<pubDate>Thu, 22 Oct 2026 10:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Thu, 22 Oct 2026 10:00:00 GMT<\/lastBuildDate>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/blog\.psiagente\.com\.br\/ansiedade<\/guid>/);
  assert.match(xml, /<category>Ansiedade<\/category>/);
});

test("montarRss: sem artigos continua sendo um feed valido", () => {
  const xml = montarRss({
    titulo: "Blog",
    descricao: "d",
    link: "https://blog.psiagente.com.br",
    linkFeed: "https://blog.psiagente.com.br/feed.xml",
    artigos: [],
  });
  assert.match(xml, /<channel>/);
  assert.doesNotMatch(xml, /<item>/);
  assert.doesNotMatch(xml, /<lastBuildDate>/);
});

// ----------------------------------------------------------------- JSON-LD

test("serializarJsonLd: escapa < (fecha-script), separadores de linha e descarta undefined", () => {
  assert.equal(serializarJsonLd({ a: "</script><b>" }), '{"a":"\\u003c/script>\\u003cb>"}');
  assert.equal(serializarJsonLd({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(serializarJsonLd({ a: "x\u2028y\u2029z" }), '{"a":"x\\u2028y\\u2029z"}');
});

test("jsonLdHome: Organization + WebSite ligados por @id, sem SoftwareApplication inventado", () => {
  const g = jsonLdHome(O);
  assert.equal(g["@context"], "https://schema.org");
  const org = g["@graph"].find((n) => n["@type"] === "Organization");
  const site = g["@graph"].find((n) => n["@type"] === "WebSite");
  assert.equal(org.name, "PsiAgente");
  assert.equal(org.url, "https://psiagente.com.br");
  assert.equal(org.logo.url, "https://psiagente.com.br/logo-512.png");
  assert.deepEqual(org.sameAs, ["https://instagram.com/psiagente"]);
  assert.equal(site.url, "https://psiagente.com.br");
  assert.equal(site.name, "PsiAgente");
  assert.equal(site.inLanguage, "pt-BR");
  assert.deepEqual(site.publisher, { "@id": org["@id"] });
  assert.equal(g["@graph"].length, 2);
});

const artigo = {
  titulo: "Ansiedade no trabalho",
  slug: "ansiedade-no-trabalho",
  resumo: "Resumo do artigo",
  conteudo: "palavra ".repeat(300),
  autor: "Equipe PsiAgente",
  publicado_em: "2026-10-22T10:00:00Z",
  atualizado_em: "2026-11-01T10:00:00Z",
  imagem_capa: null,
  categorias: [{ nome: "Ansiedade", slug: "ansiedade" }],
};
const URL_ARTIGO = "https://blog.psiagente.com.br/ansiedade-no-trabalho";
const IMAGEM = "https://blog.psiagente.com.br/ansiedade-no-trabalho/imagem-compartilhamento";

test("jsonLdArtigo: BlogPosting completo (publisher, imagem, datas, secao, palavras)", () => {
  const ld = jsonLdArtigo(artigo, { url: URL_ARTIGO, imagem: IMAGEM }, O);
  assert.equal(ld["@type"], "BlogPosting");
  assert.deepEqual(ld.mainEntityOfPage, { "@type": "WebPage", "@id": URL_ARTIGO });
  assert.equal(ld.headline, "Ansiedade no trabalho");
  assert.equal(ld.description, "Resumo do artigo");
  assert.deepEqual(ld.image, [IMAGEM]);
  assert.equal(ld.datePublished, "2026-10-22T10:00:00Z");
  assert.equal(ld.dateModified, "2026-11-01T10:00:00Z");
  assert.equal(ld.inLanguage, "pt-BR");
  assert.equal(ld.articleSection, "Ansiedade");
  assert.equal(ld.wordCount, 300);
  assert.equal(ld.publisher["@type"], "Organization");
  assert.equal(ld.publisher.name, "PsiAgente");
  assert.equal(ld.publisher.logo.url, "https://psiagente.com.br/logo-512.png");
});

test("jsonLdArtigo: autor generico (equipe) vira Organization; nome de pessoa vira Person", () => {
  const equipe = jsonLdArtigo(artigo, { url: URL_ARTIGO, imagem: IMAGEM }, O);
  assert.deepEqual(equipe.author, { "@type": "Organization", name: "PsiAgente", url: "https://psiagente.com.br" });
  const vazio = jsonLdArtigo({ ...artigo, autor: null }, { url: URL_ARTIGO, imagem: IMAGEM }, O);
  assert.equal(vazio.author["@type"], "Organization");
  const pessoa = jsonLdArtigo({ ...artigo, autor: "Dra. Ana Souza" }, { url: URL_ARTIGO, imagem: IMAGEM }, O);
  assert.deepEqual(pessoa.author, { "@type": "Person", name: "Dra. Ana Souza" });
});

test("jsonLdArtigo: sem atualizado_em usa publicado_em; sem resumo usa o inicio do texto; titulo longo e cortado", () => {
  const ld = jsonLdArtigo(
    { ...artigo, atualizado_em: null, resumo: null, conteudo: "# Oi\n\nTexto **forte** do artigo.", titulo: "T".repeat(150) },
    { url: URL_ARTIGO, imagem: IMAGEM },
    O,
  );
  assert.equal(ld.dateModified, "2026-10-22T10:00:00Z");
  assert.equal(ld.description, "Oi Texto forte do artigo.");
  assert.ok(ld.headline.length <= 110);
});

test("jsonLdBreadcrumb: lista ordenada com posicao", () => {
  assert.deepEqual(
    jsonLdBreadcrumb([
      { nome: "Blog", url: "https://blog.psiagente.com.br" },
      { nome: "Ansiedade", url: "https://blog.psiagente.com.br/categoria/ansiedade" },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: "https://blog.psiagente.com.br" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Ansiedade",
          item: "https://blog.psiagente.com.br/categoria/ansiedade",
        },
      ],
    },
  );
});

test("jsonLdBlog: Blog com publisher", () => {
  const b = jsonLdBlog(O);
  assert.equal(b["@type"], "Blog");
  assert.equal(b.name, "Blog PsiAgente");
  assert.equal(b.url, "https://blog.psiagente.com.br");
  assert.equal(b.inLanguage, "pt-BR");
  assert.equal(b.publisher.name, "PsiAgente");
});

const perfil = {
  nome: "Marta Lima",
  slug: "marta-lima",
  bio: "Atendo adultos.",
  cidade: "Belém",
  estado: "PA",
  crp: "10/12345",
  foto_url: "https://img.example/marta.jpg",
  modalidade: "ambos",
  especialidades: [
    { id: 1, nome: "Ansiedade" },
    { id: 2, nome: "Luto" },
  ],
  contato: "5591999990000",
};
const URL_PERFIL = "https://busca.psiagente.com.br/marta-lima";

test("jsonLdPerfil: Person com cargo, cidade, especialidades e CRP", () => {
  const p = jsonLdPerfil(perfil, { url: URL_PERFIL });
  assert.equal(p["@context"], "https://schema.org");
  assert.equal(p["@type"], "Person");
  assert.equal(p.name, "Marta Lima");
  assert.equal(p.url, URL_PERFIL);
  assert.equal(p.image, "https://img.example/marta.jpg");
  assert.equal(p.jobTitle, "Psicólogo(a)");
  assert.deepEqual(p.address, {
    "@type": "PostalAddress",
    addressLocality: "Belém",
    addressRegion: "PA",
    addressCountry: "BR",
  });
  assert.deepEqual(p.knowsAbout, ["Ansiedade", "Luto"]);
  assert.deepEqual(p.identifier, { "@type": "PropertyValue", propertyID: "CRP", value: "10/12345" });
});

test("jsonLdPerfil: nunca expoe o contato (WhatsApp) do profissional", () => {
  const texto = JSON.stringify(jsonLdPerfil(perfil, { url: URL_PERFIL }));
  assert.equal(texto.includes("5591999990000"), false);
  assert.equal(texto.toLowerCase().includes("whatsapp"), false);
});

test("jsonLdPerfil: sem cidade nao tem endereco; sem nome nao gera nada", () => {
  const online = jsonLdPerfil({ ...perfil, cidade: null, estado: null }, { url: URL_PERFIL });
  assert.equal(online.address, undefined);
  assert.equal(jsonLdPerfil({ ...perfil, nome: null }, { url: URL_PERFIL }), null);
});

test("tituloPerfil: nome + psicologo(a) + local", () => {
  assert.equal(tituloPerfil(perfil), "Marta Lima — Psicólogo(a) em Belém/PA");
  assert.equal(tituloPerfil({ ...perfil, cidade: null, estado: null }), "Marta Lima — Psicólogo(a) online");
});

test("tituloPerfil e descricaoPerfil: sem nome nunca escrevem 'null'", () => {
  const semNome = { ...perfil, nome: null };
  assert.equal(tituloPerfil(semNome), "Psicólogo(a) em Belém/PA");
  assert.doesNotMatch(descricaoPerfil({ ...semNome, bio: null }), /null/);
  assert.match(descricaoPerfil({ ...semNome, bio: null }), /^Psicólogo\(a\) em Belém\/PA\./);
});

test("descricaoPerfil: bio boa vale; bio curta ou ausente vira texto montado com os dados", () => {
  const longa =
    "Psicóloga clínica com foco em ansiedade e luto, atendendo adultos e adolescentes há mais de dez anos em Belém.";
  assert.equal(descricaoPerfil({ ...perfil, bio: longa }), longa);

  const montada = descricaoPerfil({ ...perfil, bio: null });
  assert.match(montada, /^Marta Lima, psicólogo\(a\) em Belém\/PA\./);
  assert.match(montada, /Ansiedade, Luto/);
  assert.ok(montada.length <= 160);

  const comBioCurta = descricaoPerfil(perfil);
  assert.match(comBioCurta, /Atendo adultos\./);
  assert.match(comBioCurta, /^Marta Lima, psicólogo\(a\) em Belém\/PA\./);
});

// ------------------------------------------------------ compartilhamento

test("IMAGEM_PADRAO: imagem 1200x630 servida do proprio host (relativa, resolvida pelo metadataBase)", () => {
  assert.deepEqual(IMAGEM_PADRAO, {
    url: "/og-default.png",
    width: 1200,
    height: 630,
    alt: "PsiAgente — gestão de consultório para psicólogos",
  });
});

test("imagemDoArtigo: a capa do artigo, quando existe; senao o cartao gerado com o titulo", () => {
  assert.equal(
    imagemDoArtigo({ slug: "x", titulo: "T", imagem_capa: "https://img.example/x.jpg" }, O),
    "https://img.example/x.jpg",
  );
  assert.deepEqual(imagemDoArtigo({ slug: "luto-e-perda", titulo: "Luto e perda", imagem_capa: null }, O), {
    url: "https://blog.psiagente.com.br/luto-e-perda/imagem-compartilhamento",
    width: 1200,
    height: 630,
    alt: "Luto e perda",
  });
});

test("alternativasBlog: canonical e feed RSS juntos (o Next troca 'alternates' inteiro a cada pagina)", () => {
  assert.deepEqual(alternativasBlog("/categoria/x"), {
    canonical: "/categoria/x",
    types: { "application/rss+xml": "/feed.xml" },
  });
  assert.deepEqual(alternativasBlog(), { types: { "application/rss+xml": "/feed.xml" } });
});

test("montarCompartilhamento: Open Graph e Twitter com marca e idioma fixos", () => {
  const c = montarCompartilhamento({
    titulo: "T",
    descricao: "D",
    url: "/x",
    imagens: ["/og-default.png"],
  });
  assert.deepEqual(c.openGraph, {
    title: "T",
    description: "D",
    url: "/x",
    siteName: "PsiAgente",
    locale: "pt_BR",
    type: "website",
    images: ["/og-default.png"],
  });
  assert.deepEqual(c.twitter, {
    card: "summary_large_image",
    title: "T",
    description: "D",
    images: ["/og-default.png"],
  });
});

test("montarCompartilhamento: artigo com extras, imagem com tamanho e descricao ausente omitida", () => {
  const c = montarCompartilhamento({
    titulo: "T",
    url: "https://blog.psiagente.com.br/x",
    tipo: "article",
    imagens: [{ url: "https://blog.psiagente.com.br/x/imagem-compartilhamento", width: 1200, height: 630 }],
    extras: { publishedTime: "2026-10-22T10:00:00Z" },
  });
  assert.equal(c.openGraph.type, "article");
  assert.equal(c.openGraph.publishedTime, "2026-10-22T10:00:00Z");
  assert.equal("description" in c.openGraph, false);
  assert.equal("description" in c.twitter, false);
  assert.deepEqual(c.twitter.images, ["https://blog.psiagente.com.br/x/imagem-compartilhamento"]);
});
