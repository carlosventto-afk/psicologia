import { test } from "node:test";
import assert from "node:assert/strict";
import { montarEmailAvisoTeste } from "./aviso-teste-plano.js";

test("escapa HTML do nome", () => {
  const { html } = montarEmailAvisoTeste({
    nome: '<script>alert("x")</script>',
    planoNome: "Psi Gestão",
    expiraEm: "2026-11-10T12:00:00Z",
    dias: 3,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("formata a data em America/Sao_Paulo", () => {
  // 02:00 UTC de 11/11 ainda é 10/11 em São Paulo (UTC-3).
  const { html, subject } = montarEmailAvisoTeste({
    nome: "Ana",
    planoNome: "Psi Gestão",
    expiraEm: "2026-11-11T02:00:00Z",
    dias: 1,
  });
  assert.ok(html.includes("10/11/2026"));
  assert.ok(subject.includes("amanhã"));
  assert.ok(html.includes("/assinatura"));
});
