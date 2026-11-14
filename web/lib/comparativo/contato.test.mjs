import { test } from "node:test";
import assert from "node:assert/strict";
import { validarContato } from "./contato.js";

const base = { nome: "Ana Souza", whatsapp: "(91) 98191-0295", email: "ana@exemplo.com" };

test("contato valido normaliza o whatsapp para digitos", () => {
  assert.deepEqual(validarContato(base), {
    ok: true,
    valor: { nome: "Ana Souza", whatsapp: "91981910295", email: "ana@exemplo.com" },
  });
});

test("whatsapp com +55 mantem o DDI", () => {
  const r = validarContato({ ...base, whatsapp: "+55 (91) 98191-0295" });
  assert.equal(r.valor.whatsapp, "5591981910295");
});

test("nome de 1 letra e rejeitado", () => {
  assert.equal(validarContato({ ...base, nome: "A" }).ok, false);
});

test("whatsapp com 9 ou 14 digitos e rejeitado", () => {
  assert.equal(validarContato({ ...base, whatsapp: "919819102" }).ok, false);
  assert.equal(validarContato({ ...base, whatsapp: "55919819102955" }).ok, false);
});

test("e-mail sem @ e rejeitado", () => {
  assert.equal(validarContato({ ...base, email: "ana.exemplo.com" }).ok, false);
});

test("entradas undefined sao rejeitadas sem lancar", () => {
  assert.equal(validarContato().ok, false);
  assert.equal(validarContato({}).ok, false);
});

test("nome com mais de 120 caracteres e email com mais de 254 sao rejeitados", () => {
  assert.equal(validarContato({ ...base, nome: "a".repeat(121) }).ok, false);
  assert.equal(validarContato({ ...base, nome: "a".repeat(120) }).ok, true);
  const longo = `${"a".repeat(247)}@ex.com`; // 247 + 7 = 254
  assert.equal(validarContato({ ...base, email: longo }).ok, true);
  assert.equal(validarContato({ ...base, email: `a${longo}` }).ok, false);
});

test("CR/LF do nome viram espaco", () => {
  assert.equal(validarContato({ ...base, nome: "Ana\r\nBcc: x@y.com" }).valor.nome, "Ana Bcc: x@y.com");
});
