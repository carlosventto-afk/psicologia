import { test } from "node:test";
import assert from "node:assert/strict";
import { limiteDuplicidade, acharDuplicado } from "./duplicidade.js";

const agora = new Date("2026-11-14T12:00:00.000Z");
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

test("limite e agora menos 10 minutos", () => {
  assert.equal(limiteDuplicidade(agora), "2026-11-14T11:50:00.000Z");
});

test("mesmo telefone dentro da janela e duplicado", () => {
  const c = [{ id: 1, telefone: "91981910295", visitante_sessao_id: null, created_at: "2026-11-14T11:55:00.000Z" }];
  assert.equal(acharDuplicado(c, { telefone: "91981910295", sessaoId: null, agora }).id, 1);
});

test("mesma sessao com telefone diferente e duplicado", () => {
  const c = [{ id: 2, telefone: "91999999999", visitante_sessao_id: S1, created_at: "2026-11-14T11:59:00.000Z" }];
  assert.equal(acharDuplicado(c, { telefone: "91981910295", sessaoId: S1, agora }).id, 2);
});

test("fora da janela (11 min) nao e duplicado; exatamente 10 min ainda e", () => {
  const velho = [{ id: 3, telefone: "91981910295", created_at: "2026-11-14T11:49:00.000Z" }];
  assert.equal(acharDuplicado(velho, { telefone: "91981910295", agora }), null);
  const limite = [{ id: 4, telefone: "91981910295", created_at: "2026-11-14T11:50:00.000Z" }];
  assert.equal(acharDuplicado(limite, { telefone: "91981910295", agora }).id, 4);
});

test("sem coincidencia, sessao ausente ou lista vazia retorna null", () => {
  const c = [{ id: 5, telefone: "91999999999", visitante_sessao_id: S2, created_at: "2026-11-14T11:58:00.000Z" }];
  assert.equal(acharDuplicado(c, { telefone: "91981910295", sessaoId: S1, agora }), null);
  assert.equal(acharDuplicado(c, { telefone: "91981910295", sessaoId: null, agora }), null);
  assert.equal(acharDuplicado([], { telefone: "91981910295", agora }), null);
  assert.equal(acharDuplicado(undefined, { telefone: "91981910295", agora }), null);
});
