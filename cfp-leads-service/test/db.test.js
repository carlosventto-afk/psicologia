import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPool, getScanState, upsertLead, saveScanState } from "../src/db.js";

const TEST_REGIAO = 999;
let pool;

before(async () => {
  pool = createPool();
  // Limpa antes também: se uma execução anterior foi interrompida antes do
  // after(), a suíte começaria suja e os asserts de estado inicial falhariam.
  await pool.query("delete from leads_cfp where crp_regiao = $1", [TEST_REGIAO]);
  await pool.query("delete from leads_cfp_scan_state where crp_regiao = $1", [TEST_REGIAO]);
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
