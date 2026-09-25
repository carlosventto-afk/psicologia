import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSlugFromUrl,
  extractCityFromUrl,
  isPsicologoRjUrl,
  parseProfileHtml,
} from "../../src/sources/doctoraliaParsing.js";

const RJ_SLUGS = new Set(["rio-de-janeiro", "niteroi"]);

test("extractSlugFromUrl pega o primeiro segmento do path", () => {
  assert.equal(extractSlugFromUrl("https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte"), "sara-alves-2");
});

test("extractCityFromUrl pega o terceiro segmento do path", () => {
  assert.equal(extractCityFromUrl("https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte"), "belo-horizonte");
});

test("isPsicologoRjUrl: true quando especialidade é psicologo e cidade está no set do RJ", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/psicologo/rio-de-janeiro", RJ_SLUGS), true);
});

test("isPsicologoRjUrl: false quando especialidade não é psicologo", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/nutricionista/rio-de-janeiro", RJ_SLUGS), false);
});

test("isPsicologoRjUrl: false quando cidade não está no RJ", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/fulana/psicologo/belo-horizonte", RJ_SLUGS), false);
});

test("isPsicologoRjUrl: false quando a URL não tem o formato esperado", () => {
  assert.equal(isPsicologoRjUrl("https://www.doctoralia.com.br/psicologo", RJ_SLUGS), false);
});

const SAMPLE_HTML = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Homepage","item":"https://www.doctoralia.com.br/"},{"@type":"ListItem","position":2,"name":"Psicólogo","item":"https://www.doctoralia.com.br/psicologo"},{"@type":"ListItem","position":3,"name":"Sara Alves"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","legalName":"Doctoralia Brasil"}
</script>
</head><body></body></html>`;

test("parseProfileHtml extrai nome e especialidade do BreadcrumbList e cidade/slug da URL", () => {
  const url = "https://www.doctoralia.com.br/sara-alves-2/psicologo/belo-horizonte";
  const lead = parseProfileHtml(SAMPLE_HTML, url);
  assert.deepEqual(lead, {
    fonte: "doctoralia",
    slug: "sara-alves-2",
    nome: "Sara Alves",
    crp: null,
    especialidade: "Psicólogo",
    cidade: "belo-horizonte",
    telefone: null,
    endereco: null,
    url,
  });
});

test("parseProfileHtml retorna null quando não há BreadcrumbList (perfil atípico)", () => {
  const html = "<html><head><script type=\"application/ld+json\">{\"@type\":\"Organization\"}</script></head><body></body></html>";
  assert.equal(parseProfileHtml(html, "https://www.doctoralia.com.br/x/psicologo/y"), null);
});

test("parseProfileHtml retorna null quando o JSON-LD está malformado", () => {
  const html = "<html><head><script type=\"application/ld+json\">{ isso não é json </script></head><body></body></html>";
  assert.equal(parseProfileHtml(html, "https://www.doctoralia.com.br/x/psicologo/y"), null);
});

const SAMPLE_HTML_4_ITEMS = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Homepage","item":"https://www.doctoralia.com.br/"},{"@type":"ListItem","position":2,"name":"Psicólogo","item":"https://www.doctoralia.com.br/psicologo"},{"@type":"ListItem","position":3,"name":"Bom Jardim","item":"https://www.doctoralia.com.br/psicologo/bom-jardim"},{"@type":"ListItem","position":4,"name":"Maria De Fátima Dos Santos Miranda"}]}
</script>
</head><body></body></html>`;

test("parseProfileHtml com 4 itens usa último position como nome, não posição fixa", () => {
  const url = "https://www.doctoralia.com.br/maria-de-fatima-dos-santos-miranda/psicologo/bom-jardim";
  const lead = parseProfileHtml(SAMPLE_HTML_4_ITEMS, url);
  assert.deepEqual(lead, {
    fonte: "doctoralia",
    slug: "maria-de-fatima-dos-santos-miranda",
    nome: "Maria De Fátima Dos Santos Miranda",
    crp: null,
    especialidade: "Psicólogo",
    cidade: "bom-jardim",
    telefone: null,
    endereco: null,
    url,
  });
});

const SAMPLE_HTML_2_ITEMS = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Homepage","item":"https://www.doctoralia.com.br/"},{"@type":"ListItem","position":2,"name":"Psicólogo","item":"https://www.doctoralia.com.br/psicologo"}]}
</script>
</head><body></body></html>`;

test("parseProfileHtml retorna null quando breadcrumb só tem 2 itens (sem item de nome)", () => {
  const html = SAMPLE_HTML_2_ITEMS;
  assert.equal(parseProfileHtml(html, "https://www.doctoralia.com.br/x/psicologo/y"), null);
});
