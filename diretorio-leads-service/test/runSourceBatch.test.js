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
