import { parseSitemapLocs } from "../parsing.js";
import { extractSlugFromSitemapUrl, mapResponseToLead, filterRjLead } from "./nossosPsicologosParsing.js";
import { numEnv } from "../env.js";

const SITEMAP_URL = "https://nossospsicologos.com.br/sitemap.xml";
const API_BASE = "https://api.nossospsicologos.com.br/v1/patient/professional/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RATE_LIMIT_SAFETY_MARGIN = numEnv("RATE_LIMIT_SAFETY_MARGIN", 10);

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${url}`);
  }
  return res.text();
}

export async function discoverProfileSlugs() {
  const xml = await fetchText(SITEMAP_URL);
  const slugs = parseSitemapLocs(xml).map(extractSlugFromSitemapUrl).filter(Boolean);
  return [...new Set(slugs)];
}

export async function fetchNossosPsicologosLead(slug) {
  const res = await fetch(`${API_BASE}${slug}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: "https://nossospsicologos.com.br/",
      Origin: "https://nossospsicologos.com.br",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em professional/${slug}`);
  }

  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  if (remainingHeader !== null) {
    // Só avalia quando o header está de fato presente: `Number(null)` é `0`,
    // então sem essa checagem um header ausente seria lido como "cota
    // zerada" e disparava o throw indevidamente.
    const remaining = Number(remainingHeader);
    if (Number.isFinite(remaining) && remaining < RATE_LIMIT_SAFETY_MARGIN) {
      // Tratado como falha transitória (não como sucesso com dado ruim): o
      // runSourceBatch retenta a mesma key com o delay normal antes de
      // eventualmente parar o lote, dando tempo da cota se recuperar.
      throw new Error(`x-ratelimit-remaining baixo (${remaining}) para professional/${slug}`);
    }
  }

  const body = await res.json();
  const url = `https://nossospsicologos.com.br/profissional/${slug}`;
  return filterRjLead(mapResponseToLead(body, slug, url));
}
