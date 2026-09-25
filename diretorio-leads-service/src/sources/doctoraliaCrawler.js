import { parseSitemapLocs, buildRjCitySlugSet } from "../parsing.js";
import { isPsicologoRjUrl, parseProfileHtml } from "./doctoraliaParsing.js";
import { computeDelayMs } from "../batchControl.js";

const SITEMAP_INDEX_URL = "https://www.doctoralia.com.br/sitemap.xml";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${url}`);
  }
  return res.text();
}

// Descoberta acontece via sitemap (robots.txt-compliant) — nunca via
// /pesquisa?, que é bloqueado explicitamente (ver spec).
export async function discoverRjPsicologoUrls() {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const doctorSitemapUrls = parseSitemapLocs(indexXml).filter((url) => url.includes("sitemap.doctor_"));

  const rjCitySlugs = buildRjCitySlugSet();
  const found = new Set();
  let first = true;
  for (const sitemapUrl of doctorSitemapUrls) {
    if (!first) {
      // Delay aleatório entre requisições ao mesmo site, mesmo durante a
      // descoberta via sitemap — evita rajada de uma dúzia de requisições
      // sequenciais sem pausa (ver spec, "nunca em rajada").
      await sleep(computeDelayMs(1000, 2000));
    }
    first = false;
    const xml = await fetchText(sitemapUrl);
    for (const url of parseSitemapLocs(xml)) {
      if (isPsicologoRjUrl(url, rjCitySlugs)) found.add(url);
    }
  }
  return [...found];
}

export async function fetchDoctoraliaLead(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${url}`);
  }
  const html = await res.text();
  return parseProfileHtml(html, url);
}
