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

test("buildRjCitySlugSet exclui os slugs puros de Valença/Sapucaia/Cantagalo (pertencem a outros estados no Doctoralia)", () => {
  const set = buildRjCitySlugSet();
  assert.ok(!set.has("valenca"), "valenca puro é Valença-BA no Doctoralia, não Valença-RJ");
  assert.ok(!set.has("sapucaia"), "sapucaia puro é Sapucaia-PA no Doctoralia, não Sapucaia-RJ");
  assert.ok(!set.has("cantagalo"), "cantagalo puro é Cantagalo-PR no Doctoralia, não Cantagalo-RJ");
});

test("buildRjCitySlugSet inclui os aliases numéricos de Valença/Sapucaia/Cantagalo e a grafia de Varre-Sai", () => {
  const set = buildRjCitySlugSet();
  assert.ok(set.has("valenca2"), "Doctoralia usa sufixo numérico 2 (sem hífen) pro slug de Valença-RJ");
  assert.ok(set.has("sapucaia2"), "Doctoralia usa sufixo numérico 2 (sem hífen) pro slug de Sapucaia-RJ");
  assert.ok(set.has("cantagalo2"), "Doctoralia usa sufixo numérico 2 (sem hífen) pro slug de Cantagalo-RJ");
  assert.ok(set.has("varre-e-sai"), "Doctoralia usa a grafia varre-e-sai pro slug de Varre-Sai");
  assert.ok(set.has("paraty-2"), "alias existente de Paraty não pode regredir");
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
