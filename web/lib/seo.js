// Regras de SEO compartilhadas pelas rotas públicas (robots, sitemaps, RSS,
// dados estruturados e Open Graph). Módulo puro — sem imports do Next nem do
// banco — para poder ser testado com `node --test`.

import { MIN_ARTIGOS_CATEGORIA } from "./blog.js";
import { classificarHost } from "./hosts.js";

const PADRAO = {
  site: "https://psiagente.com.br",
  blog: "https://blog.psiagente.com.br",
  busca: "https://busca.psiagente.com.br",
};

export const NOME_SITE = "PsiAgente";
export const DESCRICAO_BLOG = "Artigos sobre psicologia e saúde mental.";
export const DESCRICAO_BUSCA =
  "Encontre psicólogos por cidade, especialidade e modalidade (presencial ou online) e fale direto pelo WhatsApp, sem intermediários.";
const INSTAGRAM = "https://instagram.com/psiagente";
const DESCRICAO_SITE =
  "Agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp, com um agente que cuida da parte administrativa do consultório de psicologia.";

function limparOrigem(valor, padrao) {
  const v = String(valor ?? "").trim().replace(/\/+$/, "");
  return v || padrao;
}

// As leituras de process.env.NEXT_PUBLIC_* precisam aparecer escritas por
// inteiro: é assim que o Next troca pelo valor do build (a imagem final do
// Docker não carrega essas variáveis em tempo de execução).
function ambiente() {
  return {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    blog: process.env.NEXT_PUBLIC_BLOG_URL,
    busca: process.env.NEXT_PUBLIC_BUSCA_URL,
  };
}

// Origens canônicas, sem barra final. Sem variável de ambiente cai no
// domínio de produção — nunca em localhost —, para que um build mal
// configurado não publique canonical apontando para a máquina de alguém.
export function origens(env = ambiente()) {
  return {
    site: limparOrigem(env.site, PADRAO.site),
    blog: limparOrigem(env.blog, PADRAO.blog),
    busca: limparOrigem(env.busca, PADRAO.busca),
  };
}

function semUndefined(objeto) {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined));
}

function urlDoLogo(o) {
  return `${o.site}/logo-512.png`;
}

// ------------------------------------------------------------------ robots

// Áreas logadas e rotas de máquina do domínio principal. Login, cadastro e
// recuperação de senha ficam FORA da lista de propósito: elas saem do índice
// por noindex, e o Google só enxerga o noindex se puder abrir a página.
export const PREFIXOS_PRIVADOS = [
  "/admin",
  "/agenda",
  "/api",
  "/assinatura",
  "/auth",
  "/carne-leao",
  "/cobrancas",
  "/completar-cadastro",
  "/configuracoes",
  "/consultorios",
  "/diretorio",
  "/financeiro",
  "/notas-fiscais",
  "/pacientes",
  "/pacotes",
  "/painel",
  "/recibos",
  "/recorrencias",
  "/responsaveis-financeiros",
  "/sessoes",
];

// Um robots.txt por host. Em `comece.` nada é bloqueado: a saída do índice é
// feita por noindex (cabeçalho X-Robots-Tag e meta), que só funciona se o
// robô puder abrir a página.
export function robotsParaHost(host, o = origens()) {
  switch (classificarHost(host)) {
    case "blog":
      return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${o.blog}/sitemap.xml` };
    case "busca":
      // /ir/<id> registra um contato e redireciona para o WhatsApp: é ação,
      // não conteúdo, e robô nenhum deve disparar isso.
      return {
        rules: [{ userAgent: "*", allow: "/", disallow: ["/ir/"] }],
        sitemap: `${o.busca}/sitemap.xml`,
      };
    case "comece":
      return { rules: [{ userAgent: "*", allow: "/" }] };
    default:
      return {
        rules: [{ userAgent: "*", allow: "/", disallow: [...PREFIXOS_PRIVADOS] }],
        sitemap: `${o.site}/sitemap.xml`,
      };
  }
}

// ---------------------------------------------------------------- sitemaps

function paraIso(valor) {
  if (!valor) return undefined;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? undefined : data.toISOString();
}

function maisRecente(datasIso) {
  const validas = datasIso.filter(Boolean).sort();
  return validas.length > 0 ? validas[validas.length - 1] : undefined;
}

// Sem `lastModified` nas páginas estáticas: data inventada só ensina o Google
// a ignorar o campo.
export function sitemapSite(o = origens()) {
  return [
    { url: o.site, changeFrequency: "monthly", priority: 1 },
    { url: `${o.site}/comparativo`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${o.site}/cadastro`, changeFrequency: "yearly", priority: 0.5 },
  ];
}

// `artigos`: publicados, cada um com `categorias: [{ nome, slug }]`. Só entram
// categorias com artigos suficientes (MIN_ARTIGOS_CATEGORIA): menos que isso é
// página fina, que só repete os artigos.
export function sitemapBlog(artigos, o = origens()) {
  const modificadoEm = (a) => paraIso(a.atualizado_em ?? a.publicado_em);

  const categorias = new Map();
  for (const artigo of artigos) {
    for (const categoria of artigo.categorias ?? []) {
      if (!categoria?.slug) continue;
      const item = categorias.get(categoria.slug) ?? { nome: categoria.nome ?? categoria.slug, datas: [] };
      item.datas.push(modificadoEm(artigo));
      categorias.set(categoria.slug, item);
    }
  }
  const categoriasOrdenadas = [...categorias.entries()]
    .filter(([, { datas }]) => datas.length >= MIN_ARTIGOS_CATEGORIA)
    .sort((x, y) => x[1].nome.localeCompare(y[1].nome, "pt-BR"));

  return [
    semUndefined({
      url: o.blog,
      lastModified: maisRecente(artigos.map(modificadoEm)),
      changeFrequency: "weekly",
      priority: 0.8,
    }),
    ...categoriasOrdenadas.map(([slug, { datas }]) =>
      semUndefined({
        url: `${o.blog}/categoria/${slug}`,
        lastModified: maisRecente(datas),
        changeFrequency: "weekly",
        priority: 0.5,
      }),
    ),
    ...artigos.map((artigo) =>
      semUndefined({
        url: `${o.blog}/${artigo.slug}`,
        lastModified: modificadoEm(artigo),
        changeFrequency: "monthly",
        priority: 0.6,
      }),
    ),
  ];
}

export function sitemapBusca(perfis, o = origens()) {
  return [
    { url: o.busca, changeFrequency: "weekly", priority: 0.8 },
    ...perfis.map((perfil) => ({
      url: `${o.busca}/${perfil.slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
    })),
  ];
}

// ------------------------------------------------------------------- texto

// Markdown (ou HTML simples) vira texto corrido, bom para meta description.
export function textoPuro(markdown) {
  if (!markdown) return "";
  return String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Corta no limite sem partir palavra. Devolve undefined quando não sobra
// texto, para o chamador poder usar `??` com outra fonte.
export function descricaoCurta(markdown, max = 160) {
  const texto = textoPuro(markdown);
  if (!texto) return undefined;
  if (texto.length <= max) return texto;

  const limite = texto.slice(0, max - 1);
  const ultimoEspaco = limite.lastIndexOf(" ");
  const base = ultimoEspaco > max * 0.5 ? limite.slice(0, ultimoEspaco) : limite;
  return `${base.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

export function descricaoArtigo(artigo) {
  return descricaoCurta(artigo.resumo, 200) ?? descricaoCurta(artigo.conteudo, 160);
}

// --------------------------------------------------------------------- RSS

export function escaparXml(valor) {
  return String(valor ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dataRfc822(valor) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function montarRss({ titulo, descricao, link, linkFeed, artigos }) {
  const datas = artigos.map((a) => dataRfc822(a.publicadoEm)).filter(Boolean);
  const ultima = datas.length > 0 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;

  const itens = artigos.map((a) => {
    const data = dataRfc822(a.publicadoEm);
    return [
      "    <item>",
      `      <title>${escaparXml(a.titulo)}</title>`,
      `      <link>${escaparXml(a.url)}</link>`,
      `      <guid isPermaLink="true">${escaparXml(a.url)}</guid>`,
      data ? `      <pubDate>${data.toUTCString()}</pubDate>` : null,
      a.resumo ? `      <description>${escaparXml(a.resumo)}</description>` : null,
      ...(a.categorias ?? []).map((c) => `      <category>${escaparXml(c)}</category>`),
      "    </item>",
    ]
      .filter((linha) => linha !== null)
      .join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escaparXml(titulo)}</title>`,
    `    <link>${escaparXml(link)}</link>`,
    `    <description>${escaparXml(descricao)}</description>`,
    "    <language>pt-BR</language>",
    ultima ? `    <lastBuildDate>${ultima.toUTCString()}</lastBuildDate>` : null,
    `    <atom:link href="${escaparXml(linkFeed)}" rel="self" type="application/rss+xml"/>`,
    ...itens,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((linha) => linha !== null)
    .join("\n");
}

// ----------------------------------------------------------------- JSON-LD

// O "<" vira o escape unicode correspondente, para que um texto com
// "</script>" não feche a tag antes da hora; os separadores de linha e de
// parágrafo (U+2028 e U+2029) também viram escape, porque quebram literais JS
// em parsers antigos. Os dois separadores são montados por código: escritos
// direto no fonte, o próprio editor os trataria como quebra de linha.
const SEPARADOR_DE_LINHA = String.fromCharCode(0x2028);
const SEPARADOR_DE_PARAGRAFO = String.fromCharCode(0x2029);

export function serializarJsonLd(dados) {
  return JSON.stringify(dados)
    .replace(/</g, "\\u003c")
    .replaceAll(SEPARADOR_DE_LINHA, "\\u2028")
    .replaceAll(SEPARADOR_DE_PARAGRAFO, "\\u2029");
}

function editorLd(o) {
  return {
    "@type": "Organization",
    name: NOME_SITE,
    url: o.site,
    logo: { "@type": "ImageObject", url: urlDoLogo(o) },
  };
}

// Organization + WebSite na home. SoftwareApplication fica de fora de
// propósito: o Google só aceita esse tipo com nota/avaliação, e inventar
// avaliação não é opção — sem elas o Search Console marcaria erro.
export function jsonLdHome(o = origens()) {
  const idOrganizacao = `${o.site}/#organizacao`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": idOrganizacao,
        name: NOME_SITE,
        url: o.site,
        logo: { "@type": "ImageObject", url: urlDoLogo(o), width: 512, height: 512 },
        sameAs: [INSTAGRAM],
        description: DESCRICAO_SITE,
      },
      {
        "@type": "WebSite",
        "@id": `${o.site}/#site`,
        name: NOME_SITE,
        alternateName: "Psi Agente",
        url: o.site,
        inLanguage: "pt-BR",
        publisher: { "@id": idOrganizacao },
      },
    ],
  };
}

export function jsonLdBlog(o = origens()) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${o.blog}/#blog`,
    name: "Blog PsiAgente",
    description: "Artigos sobre psicologia, saúde mental e a rotina de quem atende em consultório.",
    url: o.blog,
    inLanguage: "pt-BR",
    publisher: editorLd(o),
  };
}

export function jsonLdBreadcrumb(itens) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map((item, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      name: item.nome,
      item: item.url,
    })),
  };
}

const AUTOR_GENERICO = /^equipe\s+psiagente$/i;

// Autor genérico ("Equipe PsiAgente") é a própria organização; só nome de
// pessoa vira Person. Assim não se afirma uma autoria que ninguém assumiu.
function autorLd(autor, o) {
  const nome = String(autor ?? "").trim();
  if (!nome || AUTOR_GENERICO.test(nome)) {
    return { "@type": "Organization", name: NOME_SITE, url: o.site };
  }
  return { "@type": "Person", name: nome };
}

function cortarTitulo(titulo, max = 110) {
  return titulo.length > max ? `${titulo.slice(0, max - 1).trimEnd()}…` : titulo;
}

export function jsonLdArtigo(artigo, { url, imagem }, o = origens()) {
  const palavras = textoPuro(artigo.conteudo).split(" ").filter(Boolean).length;
  return semUndefined({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: cortarTitulo(artigo.titulo),
    description: descricaoArtigo(artigo),
    image: [imagem],
    datePublished: artigo.publicado_em,
    dateModified: artigo.atualizado_em ?? artigo.publicado_em,
    inLanguage: "pt-BR",
    articleSection: artigo.categorias?.[0]?.nome,
    wordCount: palavras > 0 ? palavras : undefined,
    author: autorLd(artigo.autor, o),
    publisher: editorLd(o),
  });
}

function nomesEspecialidades(perfil) {
  return (perfil.especialidades ?? [])
    .map((e) => (typeof e === "string" ? e : e?.nome))
    .filter(Boolean);
}

function localDoPerfil(perfil) {
  if (!perfil.cidade) return "online";
  return `em ${perfil.cidade}${perfil.estado ? `/${perfil.estado}` : ""}`;
}

// Só campos que a página do perfil já mostra. O contato (WhatsApp) NÃO entra:
// o diretório o esconde atrás de /ir/<id> justamente para contar o clique.
export function jsonLdPerfil(perfil, { url }) {
  if (!perfil?.nome) return null;
  const especialidades = nomesEspecialidades(perfil);
  return semUndefined({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#psicologo`,
    name: perfil.nome,
    url,
    image: perfil.foto_url || undefined,
    jobTitle: "Psicólogo(a)",
    description: descricaoCurta(perfil.bio, 300),
    knowsAbout: especialidades.length > 0 ? especialidades : undefined,
    address: perfil.cidade
      ? semUndefined({
          "@type": "PostalAddress",
          addressLocality: perfil.cidade,
          addressRegion: perfil.estado || undefined,
          addressCountry: "BR",
        })
      : undefined,
    identifier: perfil.crp
      ? { "@type": "PropertyValue", propertyID: "CRP", value: perfil.crp }
      : undefined,
  });
}

export function tituloPerfil(perfil) {
  const funcao = `Psicólogo(a) ${localDoPerfil(perfil)}`;
  return perfil.nome ? `${perfil.nome} — ${funcao}` : funcao;
}

// Bio boa (>= 70 caracteres) vale como está. Bio curta ou ausente vira um
// texto montado com os dados do perfil, para a descrição nunca sair vazia
// nem igual à de outro profissional.
export function descricaoPerfil(perfil) {
  const bio = descricaoCurta(perfil.bio, 160);
  if (bio && bio.length >= 70) return bio;

  const especialidades = nomesEspecialidades(perfil);
  const apresentacao = perfil.nome ? `${perfil.nome}, psicólogo(a)` : "Psicólogo(a)";
  const partes = [`${apresentacao} ${localDoPerfil(perfil)}.`];
  if (bio) partes.push(/[.!?]$/.test(bio) ? bio : `${bio}.`);
  if (especialidades.length > 0) partes.push(`Especialidades: ${especialidades.join(", ")}.`);
  partes.push("Fale direto pelo WhatsApp.");
  return descricaoCurta(partes.join(" "), 160);
}

// ----------------------------------------------------------- compartilhar

// Imagem padrão de compartilhamento (public/og-default.png). URL relativa de
// propósito: o `metadataBase` do layout de cada host monta o endereço absoluto.
export const IMAGEM_PADRAO = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "PsiAgente — gestão de consultório para psicólogos",
};

// Imagem de compartilhamento de um artigo: a capa, quando há; senão o cartão
// 1200x630 com o título, gerado por app/blog/[slug]/imagem-compartilhamento.
export function imagemDoArtigo(artigo, o = origens()) {
  if (artigo.imagem_capa) return artigo.imagem_capa;
  return {
    url: `${o.blog}/${artigo.slug}/imagem-compartilhamento`,
    width: 1200,
    height: 630,
    alt: artigo.titulo,
  };
}

// Todas as páginas do blog levam o feed RSS no <head>. Como o Next troca o
// objeto `alternates` inteiro quando uma página define o seu, o feed precisa
// acompanhar o canonical em cada uma delas — daí este montador.
export function alternativasBlog(canonical) {
  return semUndefined({ canonical, types: { "application/rss+xml": "/feed.xml" } });
}

// O `openGraph` de uma página SUBSTITUI o do layout (o Next mescla de forma
// rasa), então marca e idioma precisam ir em todos — daí este montador único.
export function montarCompartilhamento({ titulo, descricao, url, tipo = "website", imagens, extras = {} }) {
  const openGraph = semUndefined({
    title: titulo,
    description: descricao,
    url,
    siteName: NOME_SITE,
    locale: "pt_BR",
    type: tipo,
    images: imagens,
    ...extras,
  });
  const twitter = semUndefined({
    card: "summary_large_image",
    title: titulo,
    description: descricao,
    images: imagens?.map((imagem) => (typeof imagem === "string" ? imagem : imagem.url)),
  });
  return { openGraph, twitter };
}
