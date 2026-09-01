import { test } from "node:test";
import assert from "node:assert/strict";

// Delays curtos: runBatch lê DELAY_MIN_MS/DELAY_MAX_MS no topo do módulo, então
// isso precisa ser setado antes do import dinâmico abaixo. Sem isso cada
// iteração dormiria 2,5-5s de verdade.
process.env.DELAY_MIN_MS = "1";
process.env.DELAY_MAX_MS = "2";
const { runBatch } = await import("../src/runBatch.js");

const CRP = 999;

// Pool falso: db.js só chama pool.query(sql, values) e nunca inspeciona o
// retorno de upsertLead/saveScanState. Para getScanState, {rows: []} faz o
// estado começar zerado (maxRegistroChecked = 0).
function fakePool() {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [] };
    },
    upserts() {
      return calls.filter((c) => c.text.includes("insert into leads_cfp ("));
    },
    scanStateSaves() {
      return calls.filter((c) => c.text.includes("insert into leads_cfp_scan_state"));
    },
  };
}

function fakeSearch(responder) {
  const fn = async (_page, registro) => {
    fn.count += 1;
    fn.registros.push(registro);
    return responder(registro, fn.count);
  };
  fn.count = 0;
  fn.registros = [];
  return fn;
}

const CAPTCHA_BODY = {
  status: 422,
  body: { recaptchaToken: ["Não foi possível confirmar o teste do reCaptcha."] },
};

test("para o lote após 2 falhas seguidas de reCAPTCHA", async () => {
  const pool = fakePool();
  const search = fakeSearch(() => CAPTCHA_BODY);

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 10, search });

  assert.match(result.haltedReason, /reCAPTCHA/);
  assert.equal(search.count, 2, "deve parar exatamente na 2ª tentativa");
  assert.equal(result.processed, 0);
  const saves = pool.scanStateSaves();
  assert.equal(saves.length, 1);
  assert.ok(saves[0].values[2], "last_error deve ser não-nulo ao parar");
  assert.match(saves[0].values[2], /reCAPTCHA/);
});

test("um timeout isolado não para o lote", async () => {
  const pool = fakePool();
  const search = fakeSearch((_registro, count) =>
    count === 1 ? { status: "timeout", body: null } : { status: 200, body: [] }
  );

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 2, search });

  assert.equal(result.haltedReason, null);
  assert.equal(result.processed, 2);
  assert.equal(result.lastRegistro, 2);
});

test("para o lote após 3 timeouts seguidos", async () => {
  const pool = fakePool();
  const search = fakeSearch(() => ({ status: "timeout", body: null }));

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 10, search });

  assert.match(result.haltedReason, /timeout persistente/);
  assert.equal(search.count, 3, "deve parar exatamente na 3ª tentativa");
  assert.equal(result.processed, 0);
  assert.equal(pool.scanStateSaves().length, 1);
});

test("para o lote após 3 validation_error seguidos", async () => {
  const pool = fakePool();
  const search = fakeSearch(() => ({ status: 422, body: { nome: ["campo inválido"] } }));

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 10, search });

  assert.match(result.haltedReason, /valida/i);
  assert.equal(search.count, 3, "deve parar exatamente na 3ª tentativa");
  assert.equal(pool.upserts().length, 0);
  const saves = pool.scanStateSaves();
  assert.equal(saves.length, 1);
  assert.ok(saves[0].values[2], "last_error deve ser não-nulo ao parar");
});

test("resposta 200 com múltiplos resultados sem match exato vira not_found e avança", async () => {
  const pool = fakePool();
  const search = fakeSearch(() => ({
    status: 200,
    body: [
      { Nome: "A", registro: "999", situacao: "ATIVO", dataInscricao: "2020-01-01" },
      { Nome: "B", registro: "998", situacao: "ATIVO", dataInscricao: "2020-01-01" },
    ],
  }));

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 1, search });

  assert.equal(result.haltedReason, null);
  assert.equal(result.processed, 1);
  assert.equal(result.found, 0);
  assert.equal(pool.upserts().length, 0, "não deve gravar lead sem match exato");
});

test("resultado encontrado grava o lead mapeado e incrementa o contador", async () => {
  const pool = fakePool();
  const search = fakeSearch((registro) => ({
    status: 200,
    body: [
      {
        Nome: "FULANO DE TAL",
        registro: String(registro),
        situacao: "ATIVO",
        dataInscricao: "2019-03-15",
      },
    ],
  }));

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 1, search });

  assert.equal(result.haltedReason, null);
  assert.equal(result.found, 1);
  const upserts = pool.upserts();
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].values, [CRP, 1, "FULANO DE TAL", "ATIVO", "2019-03-15"]);
});

test("exceção dentro do loop vira haltedReason e é persistida no scan state", async () => {
  const pool = fakePool();
  const search = fakeSearch(() => {
    throw new Error("Timeout 30000ms exceeded");
  });

  const result = await runBatch({ pool, page: null, crpRegiao: CRP, batchSize: 5, search });

  assert.match(result.haltedReason, /exceção no registro 1/);
  assert.match(result.haltedReason, /Timeout 30000ms exceeded/);
  const saves = pool.scanStateSaves();
  assert.equal(saves.length, 1);
  assert.ok(saves[0].values[2]);
});
