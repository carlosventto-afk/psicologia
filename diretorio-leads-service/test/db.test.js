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
