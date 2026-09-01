# Extrator de leads do CFP (psicólogos ativos do RJ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um serviço Node.js de longa duração que varre sequencialmente os números de registro do CRP-RJ (05ª Região) em `cadastro.cfp.org.br`, via Playwright, e mantém uma tabela `leads_cfp` no Supabase atualizada com nome/CRP/situação de cada profissional encontrado.

**Architecture:** Pacote independente `cfp-leads-service/` (mesmo padrão do `nfse-service/` já existente no repo: pasta própria, `Dockerfile` próprio, deploy separado no EasyPanel). Lógica pura de classificação/mapeamento de respostas fica isolada em módulos testáveis sem navegador; a orquestração (Playwright + Postgres) é uma camada fina por cima, verificada manualmente contra o site real e o Supabase real (não há ambiente de teste isolado para nenhum dos dois neste projeto).

**Tech Stack:** Node.js (ESM) + Playwright (Chromium) + `pg` (conexão direta ao Postgres do Supabase via `DATABASE_URL`, mesmo padrão dos scripts em `scripts/*.mjs`). Testes com o runner nativo `node --test` (sem dependência nova de framework de teste).

**Spec:** `docs/superpowers/specs/2026-09-01-scraper-leads-cfp-rj-design.md`

## Global Constraints

- Nunca tentar contornar reCAPTCHA: sem serviços terceiros de captcha-solving, sem resolução automática de desafio visível, sem rotação de IP. Se o reCAPTCHA falhar 2x seguidas, o lote para.
- Delay aleatório de 2.500–5.000ms entre cada consulta ao CFP; nunca em rajada.
- Lote de ~3.000 números de registro por execução (backfill completo de ~86 mil termina em ~29 dias corridos).
- Escopo desta entrega: só Pessoa Física, só CRP 05ª Região (RJ). Sem filtro por cidade/especialidade (a API do CFP não oferece).
- Sem dado de contato (e-mail/telefone/endereço) — não existe no cadastro público do CFP; o schema não tem essas colunas.
- `DATABASE_URL` (conexão Postgres direta ao Supabase) já está disponível no ambiente de execução, como em todos os scripts existentes de `scripts/*.mjs` — nenhuma tarefa aqui cria ou gerencia esse segredo.
- `cfp-leads-service/` é um pacote Node próprio (ESM, `"type": "module"`), independente do `package.json` CommonJS da raiz do repo — mesmo isolamento que `nfse-service/` já tem com seu `requirements.txt` separado.

---

### Task 1: Migration — tabelas `leads_cfp` e `leads_cfp_scan_state`

**Files:**
- Create: `supabase/migrations/20260901000001_add_leads_cfp.sql`
- Modify: `scripts/apply_migrations.mjs:11`

**Interfaces:**
- Produces: tabelas `leads_cfp (crp_regiao, crp_registro, nome, situacao, data_inscricao, first_seen_at, last_checked_at)` e `leads_cfp_scan_state (crp_regiao, max_registro_checked, last_error, last_run_at, updated_at)`, usadas por todas as tarefas seguintes.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260901000001_add_leads_cfp.sql`:

```sql
create table leads_cfp (
  crp_regiao smallint not null default 5,
  crp_registro integer not null,
  nome text not null,
  situacao text not null,
  data_inscricao date,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (crp_regiao, crp_registro)
);

create table leads_cfp_scan_state (
  crp_regiao smallint primary key,
  max_registro_checked integer not null default 0,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apontar o script de aplicação para a nova migration**

Em `scripts/apply_migrations.mjs:11`, trocar:

```js
const files = ["20260826000003_add_unique_classificacao_owner_nome.sql"];
```

por:

```js
const files = ["20260901000001_add_leads_cfp.sql"];
```

- [ ] **Step 3: Aplicar a migration**

Run: `node scripts/apply_migrations.mjs`
Expected: `OK: 20260901000001_add_leads_cfp.sql aplicada com sucesso.` seguido de `Todas as migrations foram aplicadas com sucesso.`

- [ ] **Step 4: Verificar que as tabelas existem**

Run:
```bash
node -e "
import('pg').then(async ({ default: pg }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(\"select table_name from information_schema.tables where table_name in ('leads_cfp','leads_cfp_scan_state') order by table_name\");
  console.log(rows);
  await client.end();
});
"
```
Expected: retorna as duas linhas `leads_cfp` e `leads_cfp_scan_state`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901000001_add_leads_cfp.sql scripts/apply_migrations.mjs
git commit -m "feat: adiciona tabelas leads_cfp e leads_cfp_scan_state"
```

---

### Task 2: Scaffold do serviço + lógica pura de classificação (`parsing.js`)

**Files:**
- Create: `cfp-leads-service/package.json`
- Create: `cfp-leads-service/src/parsing.js`
- Test: `cfp-leads-service/test/parsing.test.js`

**Interfaces:**
- Produces:
  - `classifyBuscaResponse(status: number, body: any) => { type: 'found', result: object } | { type: 'not_found' } | { type: 'captcha_failure' } | { type: 'validation_error', detail: string } | { type: 'unexpected', detail: string }`
  - `mapApiResultToLead(apiResult: object, crpRegiao: number) => { crpRegiao: number, crpRegistro: number, nome: string, situacao: string, dataInscricao: string | null }`

- [ ] **Step 1: Criar o pacote**

```bash
mkdir cfp-leads-service
mkdir cfp-leads-service/src
mkdir cfp-leads-service/test
```

Criar `cfp-leads-service/package.json`:

```json
{
  "name": "cfp-leads-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "pg": "^8.22.0",
    "playwright": "^1.48.0"
  }
}
```

Run: `cd cfp-leads-service && npm install`
Expected: instala `pg`, `playwright` e gera `package-lock.json` e `node_modules/`. Anote a versão exata resolvida do Playwright (`node -p "require('./node_modules/playwright/package.json').version"`) — vai ser usada no Dockerfile na Task 6.

- [ ] **Step 2: Escrever os testes de `classifyBuscaResponse` (falhando)**

Criar `cfp-leads-service/test/parsing.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBuscaResponse, mapApiResultToLead } from "../src/parsing.js";

test("classifyBuscaResponse: 200 com 1 resultado -> found", () => {
  const body = [
    { Nome: "ADRIANA ACRI", registro: "26274", situacao: "ATIVO", dataInscricao: "2000-03-16" },
  ];
  const result = classifyBuscaResponse(200, body);
  assert.deepEqual(result, { type: "found", result: body[0] });
});

test("classifyBuscaResponse: 200 com lista vazia -> not_found", () => {
  const result = classifyBuscaResponse(200, []);
  assert.deepEqual(result, { type: "not_found" });
});

test("classifyBuscaResponse: 422 com erro de recaptchaToken -> captcha_failure", () => {
  const body = { recaptchaToken: ["Não foi possível confirmar o teste do reCaptcha."] };
  const result = classifyBuscaResponse(422, body);
  assert.deepEqual(result, { type: "captcha_failure" });
});

test("classifyBuscaResponse: 422 com erro de validação de nome -> validation_error", () => {
  const body = { nome: ["O campo nome deve ter pelo menos 3 caracteres."] };
  const result = classifyBuscaResponse(422, body);
  assert.equal(result.type, "validation_error");
  assert.equal(result.detail, "O campo nome deve ter pelo menos 3 caracteres.");
});

test("classifyBuscaResponse: status HTTP inesperado -> unexpected", () => {
  const result = classifyBuscaResponse(500, {});
  assert.equal(result.type, "unexpected");
});

test("classifyBuscaResponse: 200 com mais de 1 resultado -> unexpected", () => {
  const body = [{ registro: "1" }, { registro: "2" }];
  const result = classifyBuscaResponse(200, body);
  assert.equal(result.type, "unexpected");
});

test("mapApiResultToLead: converte registro para inteiro e usa a região informada", () => {
  const apiResult = {
    Nome: "ADRIANA ACRI",
    registro: "26274",
    situacao: "ATIVO",
    dataInscricao: "2000-03-16",
  };
  const lead = mapApiResultToLead(apiResult, 5);
  assert.deepEqual(lead, {
    crpRegiao: 5,
    crpRegistro: 26274,
    nome: "ADRIANA ACRI",
    situacao: "ATIVO",
    dataInscricao: "2000-03-16",
  });
});

test("mapApiResultToLead: dataInscricao ausente vira null", () => {
  const apiResult = { Nome: "FULANO", registro: "123", situacao: "ATIVO", dataInscricao: null };
  const lead = mapApiResultToLead(apiResult, 5);
  assert.equal(lead.dataInscricao, null);
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd cfp-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/parsing.js'` (arquivo ainda não existe).

- [ ] **Step 4: Implementar `parsing.js`**

Criar `cfp-leads-service/src/parsing.js`:

```js
export function classifyBuscaResponse(status, body) {
  if (status === 200) {
    if (Array.isArray(body) && body.length === 1) {
      return { type: "found", result: body[0] };
    }
    if (Array.isArray(body) && body.length === 0) {
      return { type: "not_found" };
    }
    return {
      type: "unexpected",
      detail: `status 200 com corpo inesperado: ${JSON.stringify(body)}`,
    };
  }
  if (status === 422) {
    if (body && Array.isArray(body.recaptchaToken)) {
      return { type: "captcha_failure" };
    }
    if (body && Array.isArray(body.nome)) {
      return { type: "validation_error", detail: body.nome.join("; ") };
    }
    return { type: "validation_error", detail: JSON.stringify(body) };
  }
  return { type: "unexpected", detail: `status HTTP ${status}` };
}

export function mapApiResultToLead(apiResult, crpRegiao) {
  return {
    crpRegiao,
    crpRegistro: parseInt(apiResult.registro, 10),
    nome: apiResult.Nome,
    situacao: apiResult.situacao,
    dataInscricao: apiResult.dataInscricao || null,
  };
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd cfp-leads-service && npm test`
Expected: PASS — 8 testes.

- [ ] **Step 6: Commit**

```bash
git add cfp-leads-service/package.json cfp-leads-service/package-lock.json cfp-leads-service/src/parsing.js cfp-leads-service/test/parsing.test.js
git commit -m "feat(cfp-leads-service): scaffold do pacote e classificação pura de respostas da API do CFP"
```

---

### Task 3: `db.js` — acesso ao Postgres (Supabase)

**Files:**
- Create: `cfp-leads-service/src/db.js`
- Test: `cfp-leads-service/test/db.test.js`

**Interfaces:**
- Consumes: tabelas `leads_cfp` e `leads_cfp_scan_state` (Task 1); `mapApiResultToLead` retorna o shape consumido por `upsertLead` (Task 2).
- Produces:
  - `createPool() => pg.Pool`
  - `getScanState(pool, crpRegiao: number) => Promise<{ maxRegistroChecked: number, lastError: string|null, lastRunAt: Date|null }>`
  - `upsertLead(pool, lead: { crpRegiao, crpRegistro, nome, situacao, dataInscricao }) => Promise<void>`
  - `saveScanState(pool, crpRegiao: number, { maxRegistroChecked: number, lastError: string|null }) => Promise<void>`

Estes testes são de integração real contra o Supabase (não há banco de teste isolado neste projeto — mesma convenção dos scripts de diagnóstico existentes). Usam `crp_regiao = 999` como valor sentinela, distinto de 5 (RJ), e limpam os dados no final.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `cfp-leads-service/test/db.test.js`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPool, getScanState, upsertLead, saveScanState } from "../src/db.js";

const TEST_REGIAO = 999;
let pool;

before(() => {
  pool = createPool();
});

after(async () => {
  await pool.query("delete from leads_cfp where crp_regiao = $1", [TEST_REGIAO]);
  await pool.query("delete from leads_cfp_scan_state where crp_regiao = $1", [TEST_REGIAO]);
  await pool.end();
});

test("getScanState retorna estado zerado quando não existe linha", async () => {
  const state = await getScanState(pool, TEST_REGIAO);
  assert.deepEqual(state, { maxRegistroChecked: 0, lastError: null, lastRunAt: null });
});

test("upsertLead insere e depois atualiza o mesmo registro", async () => {
  await upsertLead(pool, {
    crpRegiao: TEST_REGIAO,
    crpRegistro: 1,
    nome: "TESTE UM",
    situacao: "ATIVO",
    dataInscricao: "2020-01-01",
  });
  let { rows } = await pool.query(
    "select nome, situacao from leads_cfp where crp_regiao = $1 and crp_registro = $2",
    [TEST_REGIAO, 1]
  );
  assert.equal(rows[0].nome, "TESTE UM");
  assert.equal(rows[0].situacao, "ATIVO");

  await upsertLead(pool, {
    crpRegiao: TEST_REGIAO,
    crpRegistro: 1,
    nome: "TESTE UM ATUALIZADO",
    situacao: "CANCELADO",
    dataInscricao: "2020-01-01",
  });
  ({ rows } = await pool.query(
    "select nome, situacao from leads_cfp where crp_regiao = $1 and crp_registro = $2",
    [TEST_REGIAO, 1]
  ));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nome, "TESTE UM ATUALIZADO");
  assert.equal(rows[0].situacao, "CANCELADO");
});

test("saveScanState grava e depois atualiza max_registro_checked", async () => {
  await saveScanState(pool, TEST_REGIAO, { maxRegistroChecked: 10, lastError: null });
  let state = await getScanState(pool, TEST_REGIAO);
  assert.equal(state.maxRegistroChecked, 10);

  await saveScanState(pool, TEST_REGIAO, { maxRegistroChecked: 20, lastError: "falha de teste" });
  state = await getScanState(pool, TEST_REGIAO);
  assert.equal(state.maxRegistroChecked, 20);
  assert.equal(state.lastError, "falha de teste");
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd cfp-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/db.js'`.

- [ ] **Step 3: Implementar `db.js`**

Criar `cfp-leads-service/src/db.js`:

```js
import pg from "pg";

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Defina DATABASE_URL antes de rodar o serviço.");
  }
  return new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

export async function getScanState(pool, crpRegiao) {
  const { rows } = await pool.query(
    `select max_registro_checked, last_error, last_run_at
     from leads_cfp_scan_state
     where crp_regiao = $1`,
    [crpRegiao]
  );
  if (rows.length === 0) {
    return { maxRegistroChecked: 0, lastError: null, lastRunAt: null };
  }
  return {
    maxRegistroChecked: rows[0].max_registro_checked,
    lastError: rows[0].last_error,
    lastRunAt: rows[0].last_run_at,
  };
}

export async function upsertLead(pool, lead) {
  await pool.query(
    `insert into leads_cfp (crp_regiao, crp_registro, nome, situacao, data_inscricao, last_checked_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (crp_regiao, crp_registro)
     do update set nome = excluded.nome,
                   situacao = excluded.situacao,
                   data_inscricao = excluded.data_inscricao,
                   last_checked_at = now()`,
    [lead.crpRegiao, lead.crpRegistro, lead.nome, lead.situacao, lead.dataInscricao]
  );
}

export async function saveScanState(pool, crpRegiao, { maxRegistroChecked, lastError }) {
  await pool.query(
    `insert into leads_cfp_scan_state (crp_regiao, max_registro_checked, last_error, last_run_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (crp_regiao)
     do update set max_registro_checked = excluded.max_registro_checked,
                   last_error = excluded.last_error,
                   last_run_at = now(),
                   updated_at = now()`,
    [crpRegiao, maxRegistroChecked, lastError ?? null]
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd cfp-leads-service && npm test`
Expected: PASS — 3 novos testes de `db.test.js` além dos 8 de `parsing.test.js`.

- [ ] **Step 5: Commit**

```bash
git add cfp-leads-service/src/db.js cfp-leads-service/test/db.test.js
git commit -m "feat(cfp-leads-service): acesso ao Postgres para leads_cfp e scan_state"
```

---

### Task 4: `crawler.js` — driver Playwright

**Files:**
- Create: `cfp-leads-service/src/crawler.js`

**Interfaces:**
- Consumes: nada das tarefas anteriores (é a camada de I/O de mais baixo nível).
- Produces:
  - `launchBrowser() => Promise<Browser>`
  - `openSearchPage(browser: Browser) => Promise<Page>` (navega, seleciona "Rio de Janeiro - CRP 5ª Região", expande "BUSCA AVANÇADA")
  - `searchByRegistro(page: Page, registro: number) => Promise<{ status: number | 'timeout', body: any }>` — usado pela Task 5 (`runBatch.js`) e cujo `{status, body}` alimenta `classifyBuscaResponse` (Task 2).

Não há teste automatizado aqui — depende do site real e do reCAPTCHA real, que não pode ser mockado com fidelidade. A verificação é manual, no Step 3, contra o site em produção.

- [ ] **Step 1: Implementar `crawler.js`**

Criar `cfp-leads-service/src/crawler.js`:

```js
import { chromium } from "playwright";

const BASE_URL = "https://cadastro.cfp.org.br/";
const BUSCA_URL_FRAGMENT = "cn-api.cfp.org.br/psi/busca";

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

export async function openSearchPage(browser) {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page
    .getByRole("combobox", { name: "Estado" })
    .selectOption({ label: "Rio de Janeiro - CRP 5ª Região" });
  await page.getByRole("button", { name: "BUSCA AVANÇADA" }).click();
  return page;
}

export async function searchByRegistro(page, registro) {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes(BUSCA_URL_FRAGMENT) &&
        response.url().includes(`registro=${registro}`),
      { timeout: 30000 }
    )
    .catch(() => null);

  await page.getByRole("textbox", { name: "Número de registro" }).fill(String(registro));
  await page.getByRole("button", { name: "BUSCAR" }).click();

  const response = await responsePromise;
  if (!response) {
    return { status: "timeout", body: null };
  }

  const status = response.status();
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status, body };
}
```

- [ ] **Step 2: Escrever um script manual de verificação**

Criar `cfp-leads-service/scripts/verify-crawler.mjs` (script único, não faz parte da suíte automatizada — usa o site real):

```js
import { launchBrowser, openSearchPage, searchByRegistro } from "../src/crawler.js";
import { classifyBuscaResponse } from "../src/parsing.js";

const browser = await launchBrowser();
const page = await openSearchPage(browser);

for (const registro of [26274, 999999999]) {
  const { status, body } = await searchByRegistro(page, registro);
  const outcome = classifyBuscaResponse(status, body);
  console.log(`registro=${registro} status=${status} outcome=${outcome.type}`, outcome);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

await browser.close();
```

- [ ] **Step 3: Rodar e verificar manualmente**

Run: `cd cfp-leads-service && node scripts/verify-crawler.mjs`
Expected:
- Para `registro=26274`: `outcome=found`, com `result.Nome === "ADRIANA ACRI"` e `result.situacao === "ATIVO"`.
- Para `registro=999999999`: `outcome=not_found` (número não existe).

Se qualquer um dos dois vier como `captcha_failure` ou `unexpected`, os seletores (`getByRole`) precisam ser ajustados antes de prosseguir — não seguir para a Task 5 com o crawler não confirmado contra o site real.

- [ ] **Step 4: Commit**

```bash
git add cfp-leads-service/src/crawler.js cfp-leads-service/scripts/verify-crawler.mjs
git commit -m "feat(cfp-leads-service): driver Playwright para busca por registro"
```

---

### Task 5: `batchControl.js` (lógica pura) + `runBatch.js` (orquestração)

**Files:**
- Create: `cfp-leads-service/src/batchControl.js`
- Test: `cfp-leads-service/test/batchControl.test.js`
- Create: `cfp-leads-service/src/runBatch.js`

**Interfaces:**
- Consumes: `searchByRegistro` (Task 4), `classifyBuscaResponse`/`mapApiResultToLead` (Task 2), `getScanState`/`upsertLead`/`saveScanState` (Task 3).
- Produces:
  - `computeDelayMs(minMs: number, maxMs: number, randomFn?: () => number) => number`
  - `shouldHaltOnCaptcha(consecutiveCaptchaFailures: number) => boolean`
  - `shouldHaltOnTransportError(consecutiveTransportFailures: number) => boolean`
  - `runBatch({ pool, page, crpRegiao: number, batchSize: number }) => Promise<{ processed: number, found: number, lastRegistro: number, haltedReason: string | null }>` — usado pela Task 6 (`index.js`).

- [ ] **Step 1: Escrever os testes de `batchControl.js` (falhando)**

Criar `cfp-leads-service/test/batchControl.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDelayMs,
  shouldHaltOnCaptcha,
  shouldHaltOnTransportError,
} from "../src/batchControl.js";

test("computeDelayMs respeita o intervalo min/max com randomFn determinístico", () => {
  assert.equal(computeDelayMs(2500, 5000, () => 0), 2500);
  assert.equal(computeDelayMs(2500, 5000, () => 1), 5000);
  assert.equal(computeDelayMs(2500, 5000, () => 0.5), 3750);
});

test("shouldHaltOnCaptcha só é true a partir de 2 falhas seguidas", () => {
  assert.equal(shouldHaltOnCaptcha(0), false);
  assert.equal(shouldHaltOnCaptcha(1), false);
  assert.equal(shouldHaltOnCaptcha(2), true);
  assert.equal(shouldHaltOnCaptcha(3), true);
});

test("shouldHaltOnTransportError só é true a partir de 3 falhas seguidas", () => {
  assert.equal(shouldHaltOnTransportError(1), false);
  assert.equal(shouldHaltOnTransportError(2), false);
  assert.equal(shouldHaltOnTransportError(3), true);
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd cfp-leads-service && npm test`
Expected: FAIL — `Cannot find module '../src/batchControl.js'`.

- [ ] **Step 3: Implementar `batchControl.js`**

Criar `cfp-leads-service/src/batchControl.js`:

```js
export function computeDelayMs(minMs, maxMs, randomFn = Math.random) {
  return Math.floor(minMs + randomFn() * (maxMs - minMs));
}

export function shouldHaltOnCaptcha(consecutiveCaptchaFailures) {
  return consecutiveCaptchaFailures >= 2;
}

export function shouldHaltOnTransportError(consecutiveTransportFailures) {
  return consecutiveTransportFailures >= 3;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `cd cfp-leads-service && npm test`
Expected: PASS — 3 novos testes, mais os 11 anteriores (14 no total).

- [ ] **Step 5: Implementar `runBatch.js`**

Criar `cfp-leads-service/src/runBatch.js`:

```js
import { searchByRegistro } from "./crawler.js";
import { getScanState, upsertLead, saveScanState } from "./db.js";
import { classifyBuscaResponse, mapApiResultToLead } from "./parsing.js";
import { computeDelayMs, shouldHaltOnCaptcha, shouldHaltOnTransportError } from "./batchControl.js";

const DELAY_MIN_MS = Number(process.env.DELAY_MIN_MS ?? 2500);
const DELAY_MAX_MS = Number(process.env.DELAY_MAX_MS ?? 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBatch({ pool, page, crpRegiao, batchSize }) {
  const state = await getScanState(pool, crpRegiao);
  let current = state.maxRegistroChecked;
  const end = current + batchSize;
  let processed = 0;
  let found = 0;
  let consecutiveCaptchaFailures = 0;
  let consecutiveTransportFailures = 0;
  let haltedReason = null;

  while (current < end) {
    const registro = current + 1;
    const { status, body } = await searchByRegistro(page, registro);

    if (status === "timeout") {
      consecutiveTransportFailures += 1;
      if (shouldHaltOnTransportError(consecutiveTransportFailures)) {
        haltedReason = `timeout persistente no registro ${registro}`;
        break;
      }
      await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      continue;
    }

    const outcome = classifyBuscaResponse(status, body);

    if (outcome.type === "captcha_failure") {
      consecutiveCaptchaFailures += 1;
      if (shouldHaltOnCaptcha(consecutiveCaptchaFailures)) {
        haltedReason = `reCAPTCHA falhou 2x seguidas no registro ${registro}`;
        break;
      }
      await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      continue;
    }

    consecutiveCaptchaFailures = 0;
    consecutiveTransportFailures = 0;

    if (outcome.type === "found") {
      await upsertLead(pool, mapApiResultToLead(outcome.result, crpRegiao));
      found += 1;
    } else if (outcome.type === "unexpected") {
      haltedReason = `resposta inesperada no registro ${registro}: ${outcome.detail}`;
      break;
    }

    current = registro;
    processed += 1;
    await saveScanState(pool, crpRegiao, { maxRegistroChecked: current, lastError: null });
    await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
  }

  if (haltedReason) {
    await saveScanState(pool, crpRegiao, { maxRegistroChecked: current, lastError: haltedReason });
  }

  return { processed, found, lastRegistro: current, haltedReason };
}
```

- [ ] **Step 6: Verificação manual com lote pequeno real**

Este é o início real do backfill de produção (não é dado descartável — grava direto em `leads_cfp` com `crp_regiao = 5`). Criar temporariamente `cfp-leads-service/scripts/verify-run-batch.mjs`:

```js
import { createPool } from "../src/db.js";
import { launchBrowser, openSearchPage } from "../src/crawler.js";
import { runBatch } from "../src/runBatch.js";

const pool = createPool();
const browser = await launchBrowser();
const page = await openSearchPage(browser);

const result = await runBatch({ pool, page, crpRegiao: 5, batchSize: 10 });
console.log(result);

await browser.close();
await pool.end();
```

Run: `cd cfp-leads-service && node scripts/verify-run-batch.mjs`
Expected: objeto `{ processed: 10, found: <N>, lastRegistro: 10, haltedReason: null }` (os primeiros 10 números de registro do RJ são de 1983, então `found` deve ser baixo ou 0 — não é garantia de erro). Confirmar em seguida:

```bash
node -e "
import('pg').then(async ({ default: pg }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log((await client.query('select * from leads_cfp_scan_state where crp_regiao = 5')).rows);
  console.log((await client.query('select count(*) from leads_cfp where crp_regiao = 5')).rows);
  await client.end();
});
"
```
Expected: `max_registro_checked = 10`, `last_error = null`; contagem de `leads_cfp` maior ou igual a 0 e coerente com o `found` retornado.

Apagar `cfp-leads-service/scripts/verify-run-batch.mjs` depois de confirmar (era só para a verificação manual; o backfill de verdade roda via `index.js` na Task 6).

- [ ] **Step 7: Commit**

```bash
git add cfp-leads-service/src/batchControl.js cfp-leads-service/test/batchControl.test.js cfp-leads-service/src/runBatch.js
git commit -m "feat(cfp-leads-service): controle de lote com backoff e limites de reCAPTCHA"
```

---

### Task 6: `index.js` (entrypoint agendado) + Dockerfile + `.env.example`

**Files:**
- Create: `cfp-leads-service/src/index.js`
- Create: `cfp-leads-service/Dockerfile`
- Create: `cfp-leads-service/.env.example`

**Interfaces:**
- Consumes: `createPool` (Task 3), `launchBrowser`/`openSearchPage` (Task 4), `runBatch` (Task 5).
- Produces: processo executável do serviço (`node src/index.js`), imagem Docker pronta para deploy manual no EasyPanel.

- [ ] **Step 1: Implementar `index.js`**

Criar `cfp-leads-service/src/index.js`:

```js
import { createPool } from "./db.js";
import { launchBrowser, openSearchPage } from "./crawler.js";
import { runBatch } from "./runBatch.js";

const CRP_REGIAO = Number(process.env.CRP_REGIAO ?? 5);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 3000);
const RUN_INTERVAL_HOURS = Number(process.env.RUN_INTERVAL_HOURS ?? 24);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(pool) {
  const browser = await launchBrowser();
  try {
    const page = await openSearchPage(browser);
    const result = await runBatch({ pool, page, crpRegiao: CRP_REGIAO, batchSize: BATCH_SIZE });
    console.log(
      `[cfp-leads] lote concluído: processados=${result.processed} encontrados=${result.found} ` +
        `último_registro=${result.lastRegistro} parada=${result.haltedReason ?? "nenhuma"}`
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  const pool = createPool();
  for (;;) {
    try {
      await runOnce(pool);
    } catch (err) {
      console.error("[cfp-leads] falha no lote:", err);
    }
    await sleep(RUN_INTERVAL_HOURS * 60 * 60 * 1000);
  }
}

main();
```

- [ ] **Step 2: Criar `.env.example`**

Criar `cfp-leads-service/.env.example`:

```
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
CRP_REGIAO=5
BATCH_SIZE=3000
RUN_INTERVAL_HOURS=24
DELAY_MIN_MS=2500
DELAY_MAX_MS=5000
```

- [ ] **Step 3: Criar o `Dockerfile`**

Usar a mesma tag de versão do Playwright anotada na Task 2, Step 1 (ex.: se `npm ls playwright` mostrou `1.48.0`, a imagem base é `mcr.microsoft.com/playwright:v1.48.0-jammy` — a versão da imagem e a do pacote npm precisam ser idênticas, senão o Chromium baixado não bate com o binário esperado pelo Playwright).

Criar `cfp-leads-service/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runtime
WORKDIR /app

COPY cfp-leads-service/package.json cfp-leads-service/package-lock.json ./
RUN npm ci --omit=dev

COPY cfp-leads-service/src ./src

CMD ["node", "src/index.js"]
```

- [ ] **Step 4: Validar o build da imagem (se Docker estiver disponível localmente)**

Run: `docker build -f cfp-leads-service/Dockerfile -t cfp-leads-service .` (a partir da raiz do repo)
Expected: build conclui sem erro. Se Docker não estiver disponível no ambiente local, pular este passo — o EasyPanel fará o build no primeiro deploy.

- [ ] **Step 5: Commit**

```bash
git add cfp-leads-service/src/index.js cfp-leads-service/.env.example cfp-leads-service/Dockerfile
git commit -m "feat(cfp-leads-service): entrypoint agendado e Dockerfile para deploy"
```

- [ ] **Step 6: Handoff de deploy (fora do escopo automatizável)**

Criar o serviço no EasyPanel apontando para `cfp-leads-service/Dockerfile` (mesmo fluxo já usado para `nfse-service`), configurar as variáveis de ambiente de `.env.example` (com o `DATABASE_URL` real) e iniciar. Isso não é automatizável por este plano — precisa ser feito manualmente na UI do EasyPanel (ou por pedido explícito de execução via acesso à VPS, fora deste plano).

---

## Resumo de cobertura da spec

- Descoberta técnica (API, reCAPTCHA, enumeração por registro) → Tasks 2 e 4.
- Algoritmo de varredura (estado, retries, halt em captcha) → Task 5.
- Modelo de dados → Task 1.
- Arquitetura (serviço próprio, Dockerfile, VPS) → Task 6.
- Observabilidade (`last_error`, `last_run_at`) → Tasks 1, 3, 5.
- Riscos conhecidos (headless fingerprint, mudança no site) → mitigados por design nas Tasks 4–5, sem tarefa própria (são riscos operacionais, não itens de código).
- Verificação (lote pequeno manual, retomada de estado) → Tasks 4 Step 3 e 5 Step 6.
