# Extrator de leads dos diretórios Doctoralia e Nossos Psicólogos (RJ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um serviço Node.js de longa duração que descobre e coleta psicólogos do Rio de Janeiro listados no Doctoralia e no Nossos Psicólogos (nome, CRP, especialidade, cidade, telefone/WhatsApp, endereço), mantendo uma tabela `leads_diretorio` no Supabase atualizada, sem nunca coletar CPF.

**Architecture:** Pacote independente `diretorio-leads-service/` (mesmo padrão do `cfp-leads-service/` e `nfse-service/`: pasta própria, `Dockerfile` próprio, deploy separado no EasyPanel). Ao contrário do `cfp-leads-service`, nenhuma das duas fontes precisa de Playwright — Doctoralia é HTML server-rendered (cheerio) e a API do Nossos Psicólogos responde a `fetch` simples sem autenticação (achados confirmados por investigação ao vivo, documentados no spec). Lógica pura de parsing/filtragem/mapeamento fica isolada em módulos testáveis sem rede; um orquestrador de lote genérico (`runSourceBatch`) é compartilhado pelas duas fontes; a camada de I/O real (sitemaps, HTTP) é verificada manualmente contra os sites reais.

**Tech Stack:** Node.js (ESM) + `cheerio` (parsing de HTML do Doctoralia) + `pg` (conexão direta ao Postgres do Supabase via `DATABASE_URL`) + `fetch` nativo do Node (sem dependência de HTTP client). Testes com o runner nativo `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-24-scraper-leads-diretorio-rj-design.md`

## Global Constraints

- **Nunca ler ou gravar CPF.** O JSON da API do Nossos Psicólogos inclui `data_online.professional_profile_cpf`; nenhuma função de mapeamento deste plano pode ler esse campo, mesmo indiretamente (nada de spread do objeto bruto — construção campo a campo, allowlist).
- Nunca acessar `/pesquisa?` no Doctoralia (bloqueado por `robots.txt`; descoberta é só via sitemap).
- Delay aleatório de 1.000–2.000ms entre requisições a qualquer um dos dois sites; nunca em rajada.
- Escopo geográfico: só Rio de Janeiro (RJ) nas duas fontes nesta entrega.
- Sem Playwright/browser em nenhuma das duas fontes — só HTTP (`fetch`) + `cheerio` para o Doctoralia.
- Monitorar o header `x-ratelimit-remaining` nas respostas da API do Nossos Psicólogos; se ficar abaixo de `RATE_LIMIT_SAFETY_MARGIN` (padrão 10), tratar como falha transitória (não seguir consumindo a cota).
- `DATABASE_URL` já está disponível no ambiente de execução, mesmo padrão de todos os scripts/serviços existentes — nenhuma tarefa aqui cria ou gerencia esse segredo.
- `diretorio-leads-service/` é um pacote Node próprio (ESM, `"type": "module"`), independente do resto do repo — mesmo isolamento que `cfp-leads-service/` já tem.

## Review Focus

- Perfil do Doctoralia sem o bloco JSON-LD `BreadcrumbList` esperado (perfil atípico/desatualizado) — `parseProfileHtml` deve retornar `null` em vez de produzir um lead com `nome: null` (violaria a coluna `not null`). Testado na Task 3.
- Resposta 200 da API do Nossos Psicólogos sem o objeto `professional` (payload inesperado) — `mapResponseToLead` deve retornar `null`, nunca lançar exceção nem acessar propriedades de `undefined`. Testado na Task 4.
- Profissional do Nossos Psicólogos fora do RJ (`schema.city` não termina em `-rj`) — deve ser descartado antes de chegar no banco, não só "não caber no filtro por acaso". Testado na Task 4 (`filterRjLead`).
- `runSourceBatch` chamado com lista de candidatos vazia (primeira execução antes de qualquer descoberta, ou lote em que a descoberta não retornou nada) — não pode lançar exceção nem gravar estado inconsistente. Testado na Task 6.
- CPF nunca aparece no objeto `lead` retornado por `mapResponseToLead`, mesmo que a API inclua o campo na resposta — teste de regressão explícito, não só ausência de código que o leia. Testado na Task 4.

---

### Task 1: Migration — tabelas `leads_diretorio` e `leads_diretorio_scan_state`

**Files:**
- Create: `supabase/migrations/20260924000001_add_leads_diretorio.sql`
- Create: `supabase/migrations/20260924000002_lockdown_leads_diretorio.sql`
- Modify: `scripts/apply_migrations.mjs:11`

**Interfaces:**
- Produces: tabelas `leads_diretorio (fonte, slug, nome, crp, especialidade, cidade, telefone, endereco, url, first_seen_at, last_checked_at)` e `leads_diretorio_scan_state (fonte, cursor, last_error, last_run_at, updated_at)`, usadas por todas as tarefas seguintes. `apply_migrations.mjs` também falha o processo se qualquer tabela em `public` ficar sem RLS habilitado (guarda já existente no script) — por isso a migration de lockdown é aplicada junto, não depois.

- [ ] **Step 1: Escrever a migration de criação**

Criar `supabase/migrations/20260924000001_add_leads_diretorio.sql`:

```sql
create table leads_diretorio (
  fonte text not null,
  slug text not null,
  nome text not null,
  crp text,
  especialidade text,
  cidade text,
  telefone text,
  endereco text,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (fonte, slug)
);

create table leads_diretorio_scan_state (
  fonte text primary key,
  cursor text,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Escrever a migration de lockdown**

Criar `supabase/migrations/20260924000002_lockdown_leads_diretorio.sql`:

```sql
-- Mesmo padrão de 20260901000002_lockdown_leads_cfp.sql: toda tabela nova em
-- "public" fica exposta via PostgREST com grant total a anon/authenticated
-- por padrão neste projeto Supabase. leads_diretorio guarda telefone e
-- endereço (dado pessoal, não só nome público de diretório) — ainda mais
-- crítico manter fechada do que leads_cfp. O serviço
-- (diretorio-leads-service) conecta como owner via DATABASE_URL, que ignora
-- RLS, então isso não afeta o funcionamento normal.

revoke all on public.leads_diretorio from anon, authenticated;
revoke all on public.leads_diretorio_scan_state from anon, authenticated;

alter table public.leads_diretorio enable row level security;
alter table public.leads_diretorio_scan_state enable row level security;
```

- [ ] **Step 3: Apontar o script de aplicação para as novas migrations**

Em `scripts/apply_migrations.mjs:11`, trocar a linha `const files = [...]` (qualquer que seja seu conteúdo atual) por:

```js
const files = ["20260924000001_add_leads_diretorio.sql", "20260924000002_lockdown_leads_diretorio.sql"];
```

- [ ] **Step 4: Aplicar as migrations**

Run: `node scripts/apply_migrations.mjs`
Expected: `OK: 20260924000001_add_leads_diretorio.sql aplicada com sucesso.`, depois `OK: 20260924000002_lockdown_leads_diretorio.sql aplicada com sucesso.`, depois `Todas as migrations foram aplicadas com sucesso.` e `OK: todas as tabelas em 'public' têm RLS habilitado.`

- [ ] **Step 5: Verificar que as tabelas existem e têm RLS habilitado**

Run:
```bash
node -e "
import('pg').then(async ({ default: pg }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(\"select relname, relrowsecurity from pg_class join pg_namespace n on n.oid = pg_class.relnamespace where n.nspname = 'public' and relname in ('leads_diretorio','leads_diretorio_scan_state')\");
  console.log(rows);
  await client.end();
});
"
```
Expected: duas linhas, `leads_diretorio` e `leads_diretorio_scan_state`, ambas com `relrowsecurity: true`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260924000001_add_leads_diretorio.sql supabase/migrations/20260924000002_lockdown_leads_diretorio.sql scripts/apply_migrations.mjs
git commit -m "feat: adiciona tabelas leads_diretorio e leads_diretorio_scan_state"
```

---

### Task 2: Scaffold do pacote + `parsing.js` (utilitários compartilhados)

**Files:**
- Create: `diretorio-leads-service/package.json`
- Create: `diretorio-leads-service/src/env.js`
- Create: `diretorio-leads-service/src/parsing.js`
- Test: `diretorio-leads-service/test/parsing.test.js`

**Interfaces:**
- Produces:
  - `numEnv(name: string, fallback: number, opts?: { min?: number }) => number`
  - `slugify(text: string) => string`
  - `RJ_MUNICIPIOS: string[]` (92 nomes oficiais de municípios do RJ)
  - `buildRjCitySlugSet() => Set<string>`
  - `parseSitemapLocs(xml: string) => string[]`

- [ ] **Step 1: Criar o pacote**

```bash
mkdir diretorio-leads-service
mkdir diretorio-leads-service/src
mkdir diretorio-leads-service/src/sources
mkdir diretorio-leads-service/test
mkdir diretorio-leads-service/test/sources
```

Criar `diretorio-leads-service/package.json`:

```json
{
  "name": "diretorio-leads-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "pg": "^8.22.0",
    "cheerio": "^1.2.0"
  }
}
```

Run: `cd diretorio-leads-service && npm install`
Expected: instala `pg` e `cheerio`, gera `package-lock.json` e `node_modules/`.

- [ ] **Step 2: Criar `env.js`**

Criar `diretorio-leads-service/src/env.js`:

```js
// Leitor de env numérica com validação. `Number(process.env.X ?? default)` só
// cai no default quando a variável está ausente: string vazia (X=) vira 0 e
// valor malformado vira NaN. Como o deploy é um formulário manual no
// EasyPanel, isso é uma falha realista e silenciosa — aqui a gente falha
// rápido, no boot (mesmo padrão do cfp-leads-service).
export function numEnv(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${name} inválido: ${JSON.stringify(raw)}`);
  }
  return n;
}
```

- [ ] **Step 3: Escrever os testes de `parsing.js` (falhando)**

Criar `diretorio-leads-service/test/parsing.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, RJ_MUNICIPIOS, buildRjCitySlugSet, parseSitemapLocs } from "../src/parsing.js";

test("slugify remove acentos, espaços viram hífen, tudo minúsculo", () => {
  assert.equal(slugify("Armação dos Búzios"), "armacao-dos-buzios");
  assert.equal(slugify("Rio de Janeiro"), "rio-de-janeiro");
  assert.equal(slugify("São João de Meriti"), "sao-joao-de-meriti");
  assert.equal(slugify("Varre-Sai"), "varre-sai");
});

test("RJ_MUNICIPIOS tem os 92 municípios do estado", () => {
  assert.equal(RJ_MUNICIPIOS.length, 92);
  assert.ok(RJ_MUNICIPIOS.includes("Rio de Janeiro"));
  assert.ok(RJ_MUNICIPIOS.includes("Niterói"));
  assert.ok(RJ_MUNICIPIOS.includes("Paraty"));
});

test("buildRjCitySlugSet inclui os slugs normais e o alias conhecido do Doctoralia pra Paraty", () => {
  const set = buildRjCitySlugSet();
  assert.ok(set.has("rio-de-janeiro"));
  assert.ok(set.has("niteroi"));
  assert.ok(set.has("duque-de-caxias"));
  assert.ok(set.has("paraty"));
  assert.ok(set.has("paraty-2"), "Doctoralia usa sufixo -2 pro slug de Paraty (colisão com outro estado)");
});

test("parseSitemapLocs extrai URLs únicas de <loc>", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://x.com/a</loc></url>
    <url><loc>https://x.com/b</loc></url>
    <url><loc>https://x.com/a</loc></url>
  </urlset>`;
  assert.deepEqual(parseSitemapLocs(xml), ["https://x.com/a", "https://x.com/b"]);
});

test("parseSitemapLocs retorna lista vazia quando não há <loc>", () => {
  assert.deepEqual(parseSitemapLocs("<urlset></urlset>"), []);
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `cd diretorio-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/parsing.js'`.

- [ ] **Step 5: Implementar `parsing.js`**

Criar `diretorio-leads-service/src/parsing.js`:

```js
export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Os 92 municípios do Rio de Janeiro (fonte: IBGE). Usado pra restringir a
// coleta a RJ nesta entrega (ver spec, "Não são objetivos: cobertura
// nacional").
export const RJ_MUNICIPIOS = [
  "Angra dos Reis", "Aperibé", "Araruama", "Areal", "Armação dos Búzios",
  "Arraial do Cabo", "Barra do Piraí", "Barra Mansa", "Belford Roxo",
  "Bom Jardim", "Bom Jesus do Itabapoana", "Cabo Frio", "Cachoeiras de Macacu",
  "Cambuci", "Campos dos Goytacazes", "Cantagalo", "Carapebus",
  "Cardoso Moreira", "Carmo", "Casimiro de Abreu",
  "Comendador Levy Gasparian", "Conceição de Macabu", "Cordeiro",
  "Duas Barras", "Duque de Caxias", "Engenheiro Paulo de Frontin",
  "Guapimirim", "Iguaba Grande", "Itaboraí", "Itaguaí", "Italva", "Itaocara",
  "Itaperuna", "Itatiaia", "Japeri", "Laje do Muriaé", "Macaé", "Macuco",
  "Magé", "Mangaratiba", "Maricá", "Mendes", "Mesquita", "Miguel Pereira",
  "Miracema", "Natividade", "Nilópolis", "Niterói", "Nova Friburgo",
  "Nova Iguaçu", "Paracambi", "Paraíba do Sul", "Paraty",
  "Paty do Alferes", "Petrópolis", "Pinheiral", "Piraí", "Porciúncula",
  "Porto Real", "Quatis", "Queimados", "Quissamã", "Resende", "Rio Bonito",
  "Rio Claro", "Rio das Flores", "Rio das Ostras", "Rio de Janeiro",
  "Santa Maria Madalena", "Santo Antônio de Pádua", "São Fidélis",
  "São Francisco de Itabapoana", "São Gonçalo", "São João da Barra",
  "São João de Meriti", "São José de Ubá", "São José do Vale do Rio Preto",
  "São Pedro da Aldeia", "São Sebastião do Alto", "Sapucaia", "Saquarema",
  "Seropédica", "Silva Jardim", "Sumidouro", "Tanguá", "Teresópolis",
  "Trajano de Morais", "Três Rios", "Valença", "Varre-Sai", "Vassouras",
  "Volta Redonda",
];

// Doctoralia usa o sufixo "-2" no slug de Paraty porque colide com o nome de
// outra cidade/registro em outro estado (confirmado inspecionando
// sitemap.city.xml em 24/09/2026: "paraty" sozinho não aparece, "paraty-2"
// sim). Alias documentado aqui em vez de assumido — outras colisões
// eventuais em municípios menores não são cobertas nesta entrega (risco
// aceito, ver spec).
const EXTRA_DOCTORALIA_SLUG_ALIASES = ["paraty-2"];

export function buildRjCitySlugSet() {
  const set = new Set(RJ_MUNICIPIOS.map(slugify));
  for (const alias of EXTRA_DOCTORALIA_SLUG_ALIASES) set.add(alias);
  return set;
}

export function parseSitemapLocs(xml) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls)];
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd diretorio-leads-service && npm test`
Expected: PASS — 6 testes.

- [ ] **Step 7: Commit**

```bash
git add diretorio-leads-service/package.json diretorio-leads-service/package-lock.json diretorio-leads-service/src/env.js diretorio-leads-service/src/parsing.js diretorio-leads-service/test/parsing.test.js
git commit -m "feat(diretorio-leads-service): scaffold do pacote e utilitários compartilhados de parsing"
```

---

### Task 3: `sources/doctoraliaParsing.js` — parsing puro do Doctoralia

**Files:**
- Create: `diretorio-leads-service/src/sources/doctoraliaParsing.js`
- Test: `diretorio-leads-service/test/sources/doctoraliaParsing.test.js`

**Interfaces:**
- Consumes: nenhuma das tarefas anteriores diretamente (usa `cheerio`, dependência externa).
- Produces:
  - `extractSlugFromUrl(url: string) => string | null`
  - `extractCityFromUrl(url: string) => string | null`
  - `isPsicologoRjUrl(url: string, rjCitySlugs: Set<string>) => boolean`
  - `parseProfileHtml(html: string, url: string) => { fonte: 'doctoralia', slug: string, nome: string, crp: null, especialidade: string | null, cidade: string | null, telefone: null, endereco: null, url: string } | null`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `diretorio-leads-service/test/sources/doctoraliaParsing.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSlugFromUrl,
  extractCityFromUrl,
  isPsicologoRjUrl,
  parseProfileHtml,
} from "../../src/sources/doctoraliaParsing.js";

const RJ_SLUGS = new Set(["rio-de-janeiro", "niteroi"]);

test("extractSlugFromUrl pega o primeiro segmento do path", () => {
  assert.equal(extractSlugFromUrl("https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte"), "sara-alves-2");
});

test("extractCityFromUrl pega o terceiro segmento do path", () => {
  assert.equal(extractCityFromUrl("https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte"), "belo-horizonte");
});

test("isPsicologoRjUrl: true quando especialidade é psicologo e cidade está no set do RJ", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/psicologo/rio-de-janeiro", RJ_SLUGS), true);
});

test("isPsicologoRjUrl: false quando especialidade não é psicologo", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/nutricionista/rio-de-janeiro", RJ_SLUGS), false);
});

test("isPsicologoRjUrl: false quando cidade não está no RJ", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/psicologo/belo-horizonte", RJ_SLUGS), false);
});

test("isPsicologoRjUrl: false quando a URL não tem o formato esperado", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/psicologo", RJ_SLUGS), false);
});

const SAMPLE_HTML = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Homepage","item":"https://www.doctoralia.com.br/"},{"@type":"ListItem","position":2,"name":"Psicólogo","item":"https://www.doctoralia.com.br/psicologo"},{"@type":"ListItem","position":3,"name":"Sara Alves"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","legalName":"Doctoralia Brasil"}
</script>
</head><body></body></html>`;

test("parseProfileHtml extrai nome e especialidade do BreadcrumbList e cidade/slug da URL", () => {
  const url = "https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte";
  const lead = parseProfileHtml(SAMPLE_HTML, url);
  assert.deepEqual(lead, {
    fonte: "doctoralia",
    slug: "sara-alves-2",
    nome: "Sara Alves",
    crp: null,
    especialidade: "Psicólogo",
    cidade: "belo-horizonte",
    telefone: null,
    endereco: null,
    url,
  });
});

test("parseProfileHtml retorna null quando não há BreadcrumbList (perfil atípico)", () => {
  const html = "<html><head><script type=\"application/ld+json\">{\"@type\":\"Organization\"}</script></head><body></body></html>";
  assert.equal(parseProfileHtml(html, "https://www.doctoralia.com.br/x/psicologo/y"), null);
});

test("parseProfileHtml retorna null quando o JSON-LD está malformado", () => {
  const html = "<html><head><script type=\"application/ld+json\">{ isso não é json </script></head><body></body></html>";
  assert.equal(parseProfileHtml(html, "https://www.doctoralia.com.br/x/psicologo/y"), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd diretorio-leads-service && npm test`
Expected: FAIL — `Cannot find module '../../src/sources/doctoraliaParsing.js'`.

- [ ] **Step 3: Implementar `doctoraliaParsing.js`**

Criar `diretorio-leads-service/src/sources/doctoraliaParsing.js`:

```js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd diretorio-leads-service && npm test`
Expected: PASS — 9 novos testes.

- [ ] **Step 5: Commit**

```bash
git add diretorio-leads-service/src/sources/doctoraliaParsing.js diretorio-leads-service/test/sources/doctoraliaParsing.test.js
git commit -m "feat(diretorio-leads-service): parsing puro de perfis do Doctoralia"
```

---

### Task 4: `sources/nossosPsicologosParsing.js` — parsing puro do Nossos Psicólogos

**Files:**
- Create: `diretorio-leads-service/src/sources/nossosPsicologosParsing.js`
- Test: `diretorio-leads-service/test/sources/nossosPsicologosParsing.test.js`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces:
  - `extractSlugFromSitemapUrl(url: string) => string | null`
  - `isRjCity(citySlug: string | null) => boolean`
  - `mapResponseToLead(apiResponse: object, slug: string, url: string) => Lead | null` onde `Lead = { fonte: 'nossos_psicologos', slug, nome, crp, especialidade, cidade, telefone, endereco, url }`
  - `filterRjLead(lead: Lead | null) => Lead | null` — usado pela Task 8 (`nossosPsicologosCrawler.js`) pra descartar leads fora do RJ.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `diretorio-leads-service/test/sources/nossosPsicologosParsing.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSlugFromSitemapUrl,
  isRjCity,
  mapResponseToLead,
  filterRjLead,
} from "../../src/sources/nossosPsicologosParsing.js";

test("extractSlugFromSitemapUrl pega o slug de uma URL /profissional/{slug}", () => {
  assert.equal(extractSlugFromSitemapUrl("https://nossospsicologos.com.br/profissional/leila-aparecida-lopes"), "leila-aparecida-lopes");
});

test("extractSlugFromSitemapUrl retorna null pra URL fora do padrão esperado", () => {
  assert.equal(extractSlugFromSitemapUrl("https://nossospsicologos.com.br/blog/artigo"), null);
});

test("isRjCity: true só quando o slug termina em -rj", () => {
  assert.equal(isRjCity("rio-de-janeiro-rj"), true);
  assert.equal(isRjCity("sao-paulo-sp"), false);
  assert.equal(isRjCity(null), false);
  assert.equal(isRjCity(undefined), false);
});

const FULL_RESPONSE = {
  data: {
    message: {
      professional: {
        name: "Leila Aparecida Lopes",
        council: { type: "CRP", state: "SP", number: "06/26833" },
        schema: { city: "sao-paulo-sp", specialty_name: "Psicólogo Clínico" },
        clinic: {
          telephone: "1121112222",
          address: {
            street: "Avenida Paulista", number: "326", complement: "conjunto 95",
            neighborhood: "Bela Vista", city: "São Paulo", state: "SP",
          },
        },
        data_online: { professional_profile_cpf: "04377490885" },
      },
    },
  },
};

test("mapResponseToLead extrai todos os campos esperados e monta o endereço como string única", () => {
  const url = "https://nossospsicologos.com.br/profissional/leila-aparecida-lopes";
  const lead = mapResponseToLead(FULL_RESPONSE, "leila-aparecida-lopes", url);
  assert.deepEqual(lead, {
    fonte: "nossos_psicologos",
    slug: "leila-aparecida-lopes",
    nome: "Leila Aparecida Lopes",
    crp: "06/26833-SP",
    especialidade: "Psicólogo Clínico",
    cidade: "sao-paulo-sp",
    telefone: "1121112222",
    endereco: "Avenida Paulista, 326, conjunto 95, Bela Vista, São Paulo, SP",
    url,
  });
});

test("mapResponseToLead nunca inclui CPF no objeto retornado, mesmo que a API o envie", () => {
  const lead = mapResponseToLead(FULL_RESPONSE, "leila-aparecida-lopes", "https://x/leila-aparecida-lopes");
  assert.equal("cpf" in lead, false);
  assert.equal("professional_profile_cpf" in lead, false);
  assert.equal(Object.values(lead).includes("04377490885"), false);
});

test("mapResponseToLead retorna null quando professional está ausente", () => {
  assert.equal(mapResponseToLead({ data: { message: {} } }, "x", "https://x/x"), null);
  assert.equal(mapResponseToLead({}, "x", "https://x/x"), null);
});

test("mapResponseToLead retorna null quando professional não tem nome", () => {
  const resp = { data: { message: { professional: { council: {}, schema: {}, clinic: {} } } } };
  assert.equal(mapResponseToLead(resp, "x", "https://x/x"), null);
});

test("mapResponseToLead trata clinic/address ausentes sem lançar exceção", () => {
  const resp = { data: { message: { professional: { name: "Fulano", council: {}, schema: {} } } } };
  const lead = mapResponseToLead(resp, "fulano", "https://x/fulano");
  assert.equal(lead.telefone, null);
  assert.equal(lead.endereco, null);
  assert.equal(lead.crp, null);
});

test("filterRjLead: mantém lead com cidade -rj", () => {
  const lead = { fonte: "nossos_psicologos", slug: "x", nome: "X", cidade: "niteroi-rj" };
  assert.deepEqual(filterRjLead(lead), lead);
});

test("filterRjLead: descarta lead fora do RJ", () => {
  const lead = { fonte: "nossos_psicologos", slug: "x", nome: "X", cidade: "sao-paulo-sp" };
  assert.equal(filterRjLead(lead), null);
});

test("filterRjLead: repassa null sem lançar exceção", () => {
  assert.equal(filterRjLead(null), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd diretorio-leads-service && npm test`
Expected: FAIL — `Cannot find module '../../src/sources/nossosPsicologosParsing.js'`.

- [ ] **Step 3: Implementar `nossosPsicologosParsing.js`**

Criar `diretorio-leads-service/src/sources/nossosPsicologosParsing.js`:

```js
export function extractSlugFromSitemapUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts[0] !== "profissional" || !parts[1]) return null;
  return parts[1];
}

export function isRjCity(citySlug) {
  return typeof citySlug === "string" && citySlug.endsWith("-rj");
}

// Construção campo a campo (allowlist), nunca spread do objeto bruto: mesmo
// que a API inclua CPF ou outro dado novo no payload, esta função só copia
// os campos explicitamente listados abaixo. `data_online.professional_profile_cpf`
// é deliberadamente nunca lido (ver spec, "Não são objetivos").
export function mapResponseToLead(apiResponse, slug, url) {
  const professional = apiResponse?.data?.message?.professional;
  if (!professional || !professional.name) return null;

  const council = professional.council ?? {};
  const crp = council.number ? `${council.number}${council.state ? `-${council.state}` : ""}` : null;

  const schema = professional.schema ?? {};
  const clinic = professional.clinic ?? {};
  const address = clinic.address ?? {};
  const enderecoParts = [
    address.street, address.number, address.complement,
    address.neighborhood, address.city, address.state,
  ].filter(Boolean);

  return {
    fonte: "nossos_psicologos",
    slug,
    nome: professional.name,
    crp,
    especialidade: schema.specialty_name ?? professional.occupation ?? null,
    cidade: schema.city ?? null,
    telefone: clinic.telephone ?? null,
    endereco: enderecoParts.length > 0 ? enderecoParts.join(", ") : null,
    url,
  };
}

export function filterRjLead(lead) {
  if (!lead) return null;
  return isRjCity(lead.cidade) ? lead : null;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd diretorio-leads-service && npm test`
Expected: PASS — 13 novos testes.

- [ ] **Step 5: Commit**

```bash
git add diretorio-leads-service/src/sources/nossosPsicologosParsing.js diretorio-leads-service/test/sources/nossosPsicologosParsing.test.js
git commit -m "feat(diretorio-leads-service): parsing puro da API do Nossos Psicólogos, com exclusão explícita de CPF"
```

---

### Task 5: `db.js` — acesso ao Postgres (Supabase)

**Files:**
- Create: `diretorio-leads-service/src/db.js`
- Test: `diretorio-leads-service/test/db.test.js`

**Interfaces:**
- Consumes: tabelas `leads_diretorio` e `leads_diretorio_scan_state` (Task 1). O formato de `lead` esperado por `upsertLead` é o `Lead` produzido pelas Tasks 3 e 4.
- Produces:
  - `createPool() => pg.Pool`
  - `getScanState(pool, fonte: string) => Promise<{ cursor: string|null, lastError: string|null, lastRunAt: Date|null }>`
  - `upsertLead(pool, lead: Lead) => Promise<void>`
  - `saveScanState(pool, fonte: string, { cursor: string|null, lastError: string|null }) => Promise<void>`

Testes de integração real contra o Supabase (mesma convenção do `cfp-leads-service`). Usam `fonte = 'test_sentinel'`, distinto de `'doctoralia'`/`'nossos_psicologos'`, e limpam os dados no início e no final.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `diretorio-leads-service/test/db.test.js`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPool, getScanState, upsertLead, saveScanState } from "../src/db.js";

const FONTE = "test_sentinel";
let pool;

before(async () => {
  pool = createPool();
  await pool.query("delete from leads_diretorio where fonte = $1", [FONTE]);
  await pool.query("delete from leads_diretorio_scan_state where fonte = $1", [FONTE]);
});

after(async () => {
  await pool.query("delete from leads_diretorio where fonte = $1", [FONTE]);
  await pool.query("delete from leads_diretorio_scan_state where fonte = $1", [FONTE]);
  await pool.end();
});

test("getScanState retorna estado zerado quando não existe linha", async () => {
  const state = await getScanState(pool, FONTE);
  assert.deepEqual(state, { cursor: null, lastError: null, lastRunAt: null });
});

test("upsertLead insere e depois atualiza o mesmo slug", async () => {
  const base = {
    fonte: FONTE, slug: "fulano", nome: "Fulano", crp: "06/1-RJ",
    especialidade: "Psicólogo", cidade: "rio-de-janeiro-rj",
    telefone: "21999999999", endereco: "Rua X, 1", url: "https://x/fulano",
  };
  await upsertLead(pool, base);
  let { rows } = await pool.query(
    "select nome, telefone, endereco from leads_diretorio where fonte = $1 and slug = $2",
    [FONTE, "fulano"]
  );
  assert.equal(rows[0].nome, "Fulano");
  assert.equal(rows[0].telefone, "21999999999");

  await upsertLead(pool, { ...base, nome: "Fulano Atualizado", telefone: "21988888888" });
  ({ rows } = await pool.query(
    "select nome, telefone from leads_diretorio where fonte = $1 and slug = $2",
    [FONTE, "fulano"]
  ));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nome, "Fulano Atualizado");
  assert.equal(rows[0].telefone, "21988888888");
});

test("upsertLead aceita campos nulos (Doctoralia não tem telefone/endereco/crp)", async () => {
  await upsertLead(pool, {
    fonte: FONTE, slug: "ciclana", nome: "Ciclana", crp: null,
    especialidade: "Psicólogo", cidade: "rio-de-janeiro", telefone: null,
    endereco: null, url: "https://x/ciclana",
  });
  const { rows } = await pool.query(
    "select crp, telefone, endereco from leads_diretorio where fonte = $1 and slug = $2",
    [FONTE, "ciclana"]
  );
  assert.equal(rows[0].crp, null);
  assert.equal(rows[0].telefone, null);
  assert.equal(rows[0].endereco, null);
});

test("saveScanState grava e depois atualiza cursor", async () => {
  await saveScanState(pool, FONTE, { cursor: "abc", lastError: null });
  let state = await getScanState(pool, FONTE);
  assert.equal(state.cursor, "abc");
  assert.equal(state.lastError, null);

  await saveScanState(pool, FONTE, { cursor: "def", lastError: "falha de teste" });
  state = await getScanState(pool, FONTE);
  assert.equal(state.cursor, "def");
  assert.equal(state.lastError, "falha de teste");
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd diretorio-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/db.js'`.

- [ ] **Step 3: Implementar `db.js`**

Criar `diretorio-leads-service/src/db.js`:

```js
import pg from "pg";

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Defina DATABASE_URL antes de rodar o serviço.");
  }
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  pool.on("error", (err) => {
    console.error("[diretorio-leads] erro em client idle do pool:", err.message);
  });
  return pool;
}

export async function getScanState(pool, fonte) {
  const { rows } = await pool.query(
    `select cursor, last_error, last_run_at from leads_diretorio_scan_state where fonte = $1`,
    [fonte]
  );
  if (rows.length === 0) {
    return { cursor: null, lastError: null, lastRunAt: null };
  }
  return { cursor: rows[0].cursor, lastError: rows[0].last_error, lastRunAt: rows[0].last_run_at };
}

export async function upsertLead(pool, lead) {
  await pool.query(
    `insert into leads_diretorio (fonte, slug, nome, crp, especialidade, cidade, telefone, endereco, url, last_checked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (fonte, slug)
     do update set nome = excluded.nome,
                   crp = excluded.crp,
                   especialidade = excluded.especialidade,
                   cidade = excluded.cidade,
                   telefone = excluded.telefone,
                   endereco = excluded.endereco,
                   url = excluded.url,
                   last_checked_at = now()`,
    [lead.fonte, lead.slug, lead.nome, lead.crp, lead.especialidade, lead.cidade, lead.telefone, lead.endereco, lead.url]
  );
}

export async function saveScanState(pool, fonte, { cursor, lastError }) {
  await pool.query(
    `insert into leads_diretorio_scan_state (fonte, cursor, last_error, last_run_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (fonte)
     do update set cursor = excluded.cursor,
                   last_error = excluded.last_error,
                   last_run_at = now(),
                   updated_at = now()`,
    [fonte, cursor ?? null, lastError ?? null]
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd diretorio-leads-service && npm test`
Expected: PASS — 4 novos testes de `db.test.js`.

- [ ] **Step 5: Commit**

```bash
git add diretorio-leads-service/src/db.js diretorio-leads-service/test/db.test.js
git commit -m "feat(diretorio-leads-service): acesso ao Postgres para leads_diretorio e scan_state"
```

---

### Task 6: `batchControl.js` + `runSourceBatch.js` — orquestrador genérico de lote

**Files:**
- Create: `diretorio-leads-service/src/batchControl.js`
- Create: `diretorio-leads-service/src/runSourceBatch.js`
- Test: `diretorio-leads-service/test/runSourceBatch.test.js`

**Interfaces:**
- Consumes: `getScanState`, `upsertLead`, `saveScanState` (Task 5). `fetchLead` é injetado pelo chamador — as Tasks 7 e 8 fornecem as implementações reais (`fetchDoctoraliaLead`, `fetchNossosPsicologosLead`); esta task só usa fakes.
- Produces:
  - `computeDelayMs(minMs: number, maxMs: number, randomFn?: () => number) => number`
  - `shouldHaltOnTransportError(consecutiveTransportFailures: number) => boolean`
  - `runSourceBatch({ pool, fonte: string, candidateKeys: string[], fetchLead: (key: string) => Promise<Lead|null>, batchSize: number, delayMinMs: number, delayMaxMs: number, sleep?: (ms: number) => Promise<void> }) => Promise<{ processed: number, found: number, lastKey: string, haltedReason: string|null }>` — usado pela Task 9 (`index.js`).

- [ ] **Step 1: Implementar `batchControl.js`**

Criar `diretorio-leads-service/src/batchControl.js`:

```js
export function computeDelayMs(minMs, maxMs, randomFn = Math.random) {
  return Math.floor(minMs + randomFn() * (maxMs - minMs));
}

export function shouldHaltOnTransportError(consecutiveTransportFailures) {
  return consecutiveTransportFailures >= 3;
}
```

- [ ] **Step 2: Escrever os testes de `runSourceBatch` (falhando)**

Criar `diretorio-leads-service/test/runSourceBatch.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSourceBatch } from "../src/runSourceBatch.js";

function fakePool(overrides = {}) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      if (overrides.query) return overrides.query(text, values);
      return { rows: [] };
    },
    upserts() {
      return calls.filter((c) => c.text.includes("insert into leads_diretorio ("));
    },
    scanStateSaves() {
      return calls.filter((c) => c.text.includes("insert into leads_diretorio_scan_state"));
    },
  };
}

const noopSleep = async () => {};

test("candidateKeys vazio: não lança, retorna zerado", async () => {
  const pool = fakePool();
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: [], fetchLead: async () => null,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.deepEqual(result, { processed: 0, found: 0, lastKey: "", haltedReason: null });
});

test("processa em ordem alfabética, grava leads encontrados e avança o cursor", async () => {
  const pool = fakePool();
  const fetchLead = async (key) => ({
    fonte: "doctoralia", slug: key, nome: `Nome ${key}`, crp: null,
    especialidade: "Psicólogo", cidade: "rio-de-janeiro", telefone: null,
    endereco: null, url: `https://x/${key}`,
  });
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["b", "a", "c"], fetchLead,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.equal(result.processed, 3);
  assert.equal(result.found, 3);
  assert.equal(result.lastKey, "c");
  assert.equal(pool.upserts().length, 3);
});

test("fetchLead retornando null conta como processado mas não como encontrado", async () => {
  const pool = fakePool();
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b"], fetchLead: async () => null,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.equal(result.processed, 2);
  assert.equal(result.found, 0);
  assert.equal(pool.upserts().length, 0);
});

test("respeita batchSize (não processa além do lote)", async () => {
  const pool = fakePool();
  const seen = [];
  const fetchLead = async (key) => { seen.push(key); return null; };
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b", "c", "d"], fetchLead,
    batchSize: 2, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(result.lastKey, "b");
});

test("retoma a partir do cursor salvo (só processa keys maiores que o cursor)", async () => {
  const pool = fakePool({
    query: (text) => (text.includes("select cursor")
      ? { rows: [{ cursor: "b", last_error: null, last_run_at: null }] }
      : { rows: [] }),
  });
  const seen = [];
  const fetchLead = async (key) => { seen.push(key); return null; };
  await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b", "c", "d"], fetchLead,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.deepEqual(seen, ["c", "d"]);
});

test("reinicia do começo quando o cursor já passou do fim da lista atual", async () => {
  const pool = fakePool({
    query: (text) => (text.includes("select cursor")
      ? { rows: [{ cursor: "z", last_error: null, last_run_at: null }] }
      : { rows: [] }),
  });
  const seen = [];
  const fetchLead = async (key) => { seen.push(key); return null; };
  await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b"], fetchLead,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.deepEqual(seen, ["a", "b"]);
});

test("para o lote após 3 falhas seguidas na mesma key e grava last_error", async () => {
  const pool = fakePool();
  let attempts = 0;
  const fetchLead = async () => {
    attempts += 1;
    throw new Error("timeout");
  };
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b"], fetchLead,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.equal(attempts, 3);
  assert.match(result.haltedReason, /falha persistente em a/);
  assert.equal(result.processed, 0);
  const saves = pool.scanStateSaves();
  assert.ok(saves.length >= 1);
  assert.ok(saves.at(-1).values[2], "last_error deve ser não-nulo ao parar");
});

test("falha isolada não interrompe o lote: retenta a mesma key e segue", async () => {
  const pool = fakePool();
  let count = 0;
  const fetchLead = async () => {
    count += 1;
    if (count === 1) throw new Error("timeout isolado");
    return null;
  };
  const result = await runSourceBatch({
    pool, fonte: "doctoralia", candidateKeys: ["a", "b"], fetchLead,
    batchSize: 10, delayMinMs: 1, delayMaxMs: 2, sleep: noopSleep,
  });
  assert.equal(result.haltedReason, null);
  assert.equal(result.processed, 2);
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd diretorio-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/runSourceBatch.js'`.

- [ ] **Step 4: Implementar `runSourceBatch.js`**

Criar `diretorio-leads-service/src/runSourceBatch.js`:

```js
import { getScanState, upsertLead, saveScanState } from "./db.js";
import { computeDelayMs, shouldHaltOnTransportError } from "./batchControl.js";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSourceBatch({
  pool, fonte, candidateKeys, fetchLead, batchSize, delayMinMs, delayMaxMs, sleep = defaultSleep,
}) {
  const state = await getScanState(pool, fonte);
  const cursor = state.cursor ?? "";
  const sorted = [...new Set(candidateKeys)].sort();
  let pending = sorted.filter((key) => key > cursor);
  if (pending.length === 0) pending = sorted; // fim da lista: reinicia no próximo lote
  const batch = pending.slice(0, batchSize);

  let i = 0;
  let processed = 0;
  let found = 0;
  let consecutiveTransportFailures = 0;
  let haltedReason = null;
  let lastKey = cursor;

  try {
    while (i < batch.length) {
      const key = batch[i];
      let lead;
      try {
        lead = await fetchLead(key);
      } catch (err) {
        consecutiveTransportFailures += 1;
        if (shouldHaltOnTransportError(consecutiveTransportFailures)) {
          haltedReason = `falha persistente em ${key}: ${err.message}`;
          break;
        }
        await sleep(computeDelayMs(delayMinMs, delayMaxMs));
        continue; // retenta a mesma key, não avança i
      }

      consecutiveTransportFailures = 0;
      if (lead) {
        await upsertLead(pool, lead);
        found += 1;
      }
      lastKey = key;
      processed += 1;
      i += 1;
      await saveScanState(pool, fonte, { cursor: lastKey, lastError: null });
      await sleep(computeDelayMs(delayMinMs, delayMaxMs));
    }
  } catch (err) {
    // fetchLead/upsertLead podem lançar fora do try interno (ex.: upsertLead
    // falhando por erro de conexão). Sem este catch a exceção subiria sem
    // persistir last_error, deixando o scan_state com last_error = null e o
    // serviço parecendo saudável apesar da falha.
    haltedReason = `exceção em ${batch[i]}: ${err.message}`;
  }

  if (haltedReason) {
    await saveScanState(pool, fonte, { cursor: lastKey, lastError: haltedReason });
  }

  return { processed, found, lastKey, haltedReason };
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd diretorio-leads-service && npm test`
Expected: PASS — 8 novos testes.

- [ ] **Step 6: Commit**

```bash
git add diretorio-leads-service/src/batchControl.js diretorio-leads-service/src/runSourceBatch.js diretorio-leads-service/test/runSourceBatch.test.js
git commit -m "feat(diretorio-leads-service): orquestrador genérico de lote com retomada por cursor e halt em falha persistente"
```

---

### Task 7: `sources/doctoraliaCrawler.js` — descoberta e coleta reais (Doctoralia)

**Files:**
- Create: `diretorio-leads-service/src/sources/doctoraliaCrawler.js`

**Interfaces:**
- Consumes: `parseSitemapLocs`, `buildRjCitySlugSet` (Task 2); `isPsicologoRjUrl`, `parseProfileHtml` (Task 3).
- Produces:
  - `discoverRjPsicologoUrls() => Promise<string[]>` — usado pela Task 9 (`index.js`) como `candidateKeys` do Doctoralia.
  - `fetchDoctoraliaLead(url: string) => Promise<Lead | null>` — usado pela Task 9 como `fetchLead` do Doctoralia (via `runSourceBatch`).

Sem teste automatizado — depende dos sites reais (sitemaps de dezenas de MB, perfis reais). Verificação é manual, no Step 3, contra o Doctoralia em produção.

- [ ] **Step 1: Implementar `doctoraliaCrawler.js`**

Criar `diretorio-leads-service/src/sources/doctoraliaCrawler.js`:

```js
import { parseSitemapLocs, buildRjCitySlugSet } from "../parsing.js";
import { isPsicologoRjUrl, parseProfileHtml } from "./doctoraliaParsing.js";

const SITEMAP_INDEX_URL = "https://www.doctoralia.com.br/sitemap.xml";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  for (const sitemapUrl of doctorSitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    for (const url of parseSitemapLocs(xml)) {
      if (isPsicologoRjUrl(url, rjCitySlugs)) found.add(url);
    }
  }
  return [...found];
}

export async function fetchDoctoraliaLead(url) {
  const html = await fetchText(url);
  return parseProfileHtml(html, url);
}
```

- [ ] **Step 2: Verificação manual — descoberta**

Criar temporariamente `diretorio-leads-service/scripts/verify-discover-doctoralia.mjs`:

```js
import { discoverRjPsicologoUrls } from "../src/sources/doctoraliaCrawler.js";

const urls = await discoverRjPsicologoUrls();
console.log(`Total de URLs de psicólogos do RJ encontradas: ${urls.length}`);
console.log(urls.slice(0, 10));
```

Run: `cd diretorio-leads-service && node scripts/verify-discover-doctoralia.mjs`
Expected: um número razoável de URLs (dezenas a poucos milhares — este é o primeiro número real da entrega, não estimado antes), todas no formato `https://www.doctoralia.com.br/{slug}/psicologo/{cidade-rj}`. Confirma visualmente que as cidades nas primeiras 10 URLs são mesmo do RJ (ex. `rio-de-janeiro`, `niteroi`, `nova-iguacu`).

- [ ] **Step 3: Verificação manual — coleta de um perfil real**

Criar temporariamente `diretorio-leads-service/scripts/verify-fetch-doctoralia.mjs`:

```js
import { discoverRjPsicologoUrls, fetchDoctoraliaLead } from "../src/sources/doctoraliaCrawler.js";

const urls = await discoverRjPsicologoUrls();
const sample = urls.slice(0, 3);
for (const url of sample) {
  const lead = await fetchDoctoraliaLead(url);
  console.log(lead);
}
```

Run: `cd diretorio-leads-service && node scripts/verify-fetch-doctoralia.mjs`
Expected: 3 objetos `Lead` com `nome` e `especialidade` preenchidos, `cidade` sendo um município do RJ, `telefone`/`endereco`/`crp` sempre `null` (esperado pra esta fonte). Se algum vier `null` (perfil sem BreadcrumbList), não é erro — confirma que o guard da Task 3 está funcionando.

Apagar `diretorio-leads-service/scripts/verify-discover-doctoralia.mjs` e `verify-fetch-doctoralia.mjs` depois de confirmar (eram só para verificação manual).

- [ ] **Step 4: Commit**

```bash
git add diretorio-leads-service/src/sources/doctoraliaCrawler.js
git commit -m "feat(diretorio-leads-service): descoberta via sitemap e coleta de perfis do Doctoralia"
```

---

### Task 8: `sources/nossosPsicologosCrawler.js` — descoberta e coleta reais (Nossos Psicólogos)

**Files:**
- Create: `diretorio-leads-service/src/sources/nossosPsicologosCrawler.js`

**Interfaces:**
- Consumes: `parseSitemapLocs` (Task 2); `extractSlugFromSitemapUrl`, `mapResponseToLead`, `filterRjLead` (Task 4).
- Produces:
  - `discoverProfileSlugs() => Promise<string[]>` — usado pela Task 9 como `candidateKeys` do Nossos Psicólogos.
  - `fetchNossosPsicologosLead(slug: string) => Promise<Lead | null>` — usado pela Task 9 como `fetchLead` (via `runSourceBatch`).

Sem teste automatizado — depende da API real. Verificação manual no Step 2.

- [ ] **Step 1: Implementar `nossosPsicologosCrawler.js`**

Criar `diretorio-leads-service/src/sources/nossosPsicologosCrawler.js`:

```js
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

  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (Number.isFinite(remaining) && remaining < RATE_LIMIT_SAFETY_MARGIN) {
    // Tratado como falha transitória (não como sucesso com dado ruim): o
    // runSourceBatch retenta a mesma key com o delay normal antes de
    // eventualmente parar o lote, dando tempo da cota se recuperar.
    throw new Error(`x-ratelimit-remaining baixo (${remaining}) para professional/${slug}`);
  }

  const body = await res.json();
  const url = `https://nossospsicologos.com.br/profissional/${slug}`;
  return filterRjLead(mapResponseToLead(body, slug, url));
}
```

- [ ] **Step 2: Verificação manual**

Criar temporariamente `diretorio-leads-service/scripts/verify-nossos-psicologos.mjs`:

```js
import { discoverProfileSlugs, fetchNossosPsicologosLead } from "../src/sources/nossosPsicologosCrawler.js";

const slugs = await discoverProfileSlugs();
console.log(`Total de slugs descobertos: ${slugs.length}`);

const sample = slugs.slice(0, 5);
for (const slug of sample) {
  const lead = await fetchNossosPsicologosLead(slug);
  console.log(slug, "->", lead);
}
```

Run: `cd diretorio-leads-service && node scripts/verify-nossos-psicologos.mjs`
Expected: total de slugs na casa de milhares (é uma base nacional, a filtragem por RJ acontece depois, por lead individual); dos 5 de amostra, a maioria deve vir `null` (a amostra é nacional, não filtrada por RJ — só uma fração será do RJ), mas pelo menos os que não vierem `null` devem ter `cidade` terminando em `-rj`, `telefone` e `endereco` preenchidos, e **nenhum campo `cpf`/`professional_profile_cpf` no objeto logado** (confirmar visualmente no `console.log`).

Apagar `diretorio-leads-service/scripts/verify-nossos-psicologos.mjs` depois de confirmar.

- [ ] **Step 3: Commit**

```bash
git add diretorio-leads-service/src/sources/nossosPsicologosCrawler.js
git commit -m "feat(diretorio-leads-service): descoberta via sitemap e coleta via API do Nossos Psicólogos"
```

---

### Task 9: `index.js` (entrypoint agendado) + Dockerfile + `.env.example`

**Files:**
- Create: `diretorio-leads-service/src/index.js`
- Create: `diretorio-leads-service/Dockerfile`
- Create: `diretorio-leads-service/.env.example`

**Interfaces:**
- Consumes: `createPool` (Task 5); `runSourceBatch` (Task 6); `discoverRjPsicologoUrls`/`fetchDoctoraliaLead` (Task 7); `discoverProfileSlugs`/`fetchNossosPsicologosLead` (Task 8); `numEnv` (Task 2).
- Produces: processo executável do serviço (`node src/index.js`), imagem Docker pronta para deploy manual no EasyPanel.

- [ ] **Step 1: Implementar `index.js`**

Criar `diretorio-leads-service/src/index.js`:

```js
import { createPool } from "./db.js";
import { runSourceBatch } from "./runSourceBatch.js";
import { discoverRjPsicologoUrls, fetchDoctoraliaLead } from "./sources/doctoraliaCrawler.js";
import { discoverProfileSlugs, fetchNossosPsicologosLead } from "./sources/nossosPsicologosCrawler.js";
import { numEnv } from "./env.js";

const BATCH_SIZE = numEnv("BATCH_SIZE", 500);
const RUN_INTERVAL_HOURS = numEnv("RUN_INTERVAL_HOURS", 24);
const DELAY_MIN_MS = numEnv("DELAY_MIN_MS", 1000);
const DELAY_MAX_MS = numEnv("DELAY_MAX_MS", 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneSource({ pool, fonte, discover, fetchLead, label }) {
  const candidateKeys = await discover();
  const result = await runSourceBatch({
    pool, fonte, candidateKeys, fetchLead,
    batchSize: BATCH_SIZE, delayMinMs: DELAY_MIN_MS, delayMaxMs: DELAY_MAX_MS,
  });
  console.log(
    `[diretorio-leads] ${label}: candidatos=${candidateKeys.length} processados=${result.processed} ` +
      `encontrados=${result.found} última_key=${result.lastKey} parada=${result.haltedReason ?? "nenhuma"}`
  );
}

async function main() {
  const pool = createPool();
  for (;;) {
    try {
      await runOneSource({
        pool, fonte: "doctoralia", discover: discoverRjPsicologoUrls,
        fetchLead: fetchDoctoraliaLead, label: "doctoralia",
      });
    } catch (err) {
      console.error("[diretorio-leads] falha no lote doctoralia:", err);
    }
    try {
      await runOneSource({
        pool, fonte: "nossos_psicologos", discover: discoverProfileSlugs,
        fetchLead: fetchNossosPsicologosLead, label: "nossos_psicologos",
      });
    } catch (err) {
      console.error("[diretorio-leads] falha no lote nossos_psicologos:", err);
    }
    await sleep(RUN_INTERVAL_HOURS * 60 * 60 * 1000);
  }
}

main();
```

- [ ] **Step 2: Criar `.env.example`**

Criar `diretorio-leads-service/.env.example`:

```
# IMPORTANTE: rodar com exatamente 1 réplica — não há lock de concorrência
# no código. Duas réplicas fariam scan duplicado e dobrariam a taxa de
# requisições contra os dois sites.
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
BATCH_SIZE=500
RUN_INTERVAL_HOURS=24
DELAY_MIN_MS=1000
DELAY_MAX_MS=2000
RATE_LIMIT_SAFETY_MARGIN=10
```

- [ ] **Step 3: Criar o `Dockerfile`**

Criar `diretorio-leads-service/Dockerfile`:

```dockerfile
FROM node:22-alpine AS runtime
WORKDIR /app

COPY diretorio-leads-service/package.json diretorio-leads-service/package-lock.json ./
RUN npm ci --omit=dev

COPY diretorio-leads-service/src ./src

USER node
CMD ["node", "src/index.js"]
```

- [ ] **Step 4: Validar o build da imagem (se Docker estiver disponível localmente)**

Run: `docker build -f diretorio-leads-service/Dockerfile -t diretorio-leads-service .` (a partir da raiz do repo)
Expected: build conclui sem erro. Se Docker não estiver disponível no ambiente local, pular este passo — o EasyPanel fará o build no primeiro deploy.

- [ ] **Step 5: Verificação manual de ponta a ponta (lote real pequeno)**

Este é o início real da coleta de produção (grava direto em `leads_diretorio`). Criar temporariamente `diretorio-leads-service/scripts/verify-end-to-end.mjs`:

```js
import { createPool } from "../src/db.js";
import { runSourceBatch } from "../src/runSourceBatch.js";
import { discoverRjPsicologoUrls, fetchDoctoraliaLead } from "../src/sources/doctoraliaCrawler.js";

const pool = createPool();
const candidateKeys = await discoverRjPsicologoUrls();
const result = await runSourceBatch({
  pool, fonte: "doctoralia", candidateKeys, fetchLead: fetchDoctoraliaLead,
  batchSize: 10, delayMinMs: 1000, delayMaxMs: 2000,
});
console.log(result);
await pool.end();
```

Run: `cd diretorio-leads-service && node scripts/verify-end-to-end.mjs`
Expected: `{ processed: 10, found: <N>, lastKey: <url>, haltedReason: null }`. Confirmar em seguida:

```bash
node -e "
import('pg').then(async ({ default: pg }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log((await client.query(\"select * from leads_diretorio_scan_state where fonte = 'doctoralia'\")).rows);
  console.log((await client.query(\"select count(*) from leads_diretorio where fonte = 'doctoralia'\")).rows);
  await client.end();
});
"
```
Expected: `cursor` não-nulo e igual ao `lastKey` retornado, `last_error = null`; contagem de `leads_diretorio` coerente com o `found` retornado.

Apagar `diretorio-leads-service/scripts/verify-end-to-end.mjs` depois de confirmar (a coleta real de produção roda via `index.js`, não por este script).

- [ ] **Step 6: Commit**

```bash
git add diretorio-leads-service/src/index.js diretorio-leads-service/.env.example diretorio-leads-service/Dockerfile
git commit -m "feat(diretorio-leads-service): entrypoint agendado (duas fontes) e Dockerfile para deploy"
```

- [ ] **Step 7: Handoff de deploy (fora do escopo automatizável)**

Criar o serviço no EasyPanel apontando para `diretorio-leads-service/Dockerfile` (mesmo fluxo já usado para `cfp-leads-service`/`nfse-service`), configurar as variáveis de ambiente de `.env.example` (com o `DATABASE_URL` real) e iniciar. Não é automatizável por este plano — precisa ser feito manualmente na UI do EasyPanel.

---

## Resumo de cobertura da spec

- Descoberta técnica (sitemaps, endpoint real da API, ausência de Playwright) → Tasks 2, 3, 4, 7, 8.
- Algoritmo de varredura (cursor, retomada, halt em falha persistente) → Task 6.
- Modelo de dados → Task 1.
- Arquitetura (serviço próprio, Dockerfile, VPS) → Task 9.
- Campos coletados (nome/CRP/especialidade/cidade/telefone/endereço) e exclusão deliberada de CPF → Tasks 3, 4 (com teste de regressão explícito pro CPF).
- Observabilidade (`last_error`, `last_run_at`, `cursor`) → Tasks 1, 5, 6.
- Riscos conhecidos (LGPD, mudança de site, rate-limit, bloqueio de IP) → mitigados por design nas Tasks 6, 8, sem tarefa própria (são riscos operacionais, não itens de código) — exceto o monitoramento de `x-ratelimit-remaining`, que é código real na Task 8.
