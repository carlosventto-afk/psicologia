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
