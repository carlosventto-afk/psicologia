import * as cheerio from "cheerio";

function pathSegments(url) {
  return new URL(url).pathname.split("/").filter(Boolean);
}

export function extractSlugFromUrl(url) {
  return pathSegments(url)[0] ?? null;
}

export function extractCityFromUrl(url) {
  return pathSegments(url)[2] ?? null;
}

export function isPsicologoRjUrl(url, rjCitySlugs) {
  const parts = pathSegments(url);
  if (parts.length !== 3) return false;
  const [, especialidade, cidade] = parts;
  return especialidade === "psicologo" && rjCitySlugs.has(cidade);
}

export function parseProfileHtml(html, url) {
  const $ = cheerio.load(html);
  let nome = null;
  let especialidade = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    if (data["@type"] !== "BreadcrumbList") return;
    for (const item of data.itemListElement ?? []) {
      if (item.position === 2) especialidade = item.name ?? especialidade;
      if (item.position === 3) nome = item.name ?? nome;
    }
  });

  if (!nome) return null;

  return {
    fonte: "doctoralia",
    slug: extractSlugFromUrl(url),
    nome,
    crp: null,
    especialidade,
    cidade: extractCityFromUrl(url),
    telefone: null,
    endereco: null,
    url,
  };
}
