import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSlugFromSitemapUrl,
  isRjCity,
  mapResponseToLead,
  filterRjLead,
} from "../../src/sources/nossosPsicologosParsing.js";

test("extractSlugFromSitemapUrl pega o slug de uma URL /profissional/{slug}", () => {
  assert.equal(extractSlugFromSitemapUrl("https://nossospsicologos.com.br/profissional/leila-aparecida-lopes"), "leila-aparecida-lopes");
});

test("extractSlugFromSitemapUrl retorna null pra URL fora do padrão esperado", () => {
  assert.equal(extractSlugFromSitemapUrl("https://nossospsicologos.com.br/blog/artigo"), null);
});

test("isRjCity: true só quando o slug termina em -rj", () => {
  assert.equal(isRjCity("rio-de-janeiro-rj"), true);
  assert.equal(isRjCity("sao-paulo-sp"), false);
  assert.equal(isRjCity(null), false);
  assert.equal(isRjCity(undefined), false);
});

const FULL_RESPONSE = {
  data: {
    message: {
      professional: {
        name: "Leila Aparecida Lopes",
        council: { type: "CRP", state: "SP", number: "06/26833" },
        schema: { city: "sao-paulo-sp", specialty_name: "Psicólogo Clínico" },
        clinic: {
          telephone: "1121112222",
          address: {
            street: "Avenida Paulista", number: "326", complement: "conjunto 95",
            neighborhood: "Bela Vista", city: "São Paulo", state: "SP",
          },
        },
        data_online: { professional_profile_cpf: "04377490885" },
      },
    },
  },
};

test("mapResponseToLead extrai todos os campos esperados e monta o endereço como string única", () => {
  const url = "https://nossospsicologos.com.br/profissional/leila-aparecida-lopes";
  const lead = mapResponseToLead(FULL_RESPONSE, "leila-aparecida-lopes", url);
  assert.deepEqual(lead, {
    fonte: "nossos_psicologos",
    slug: "leila-aparecida-lopes",
    nome: "Leila Aparecida Lopes",
    crp: "06/26833-SP",
    especialidade: "Psicólogo Clínico",
    cidade: "sao-paulo-sp",
    telefone: "1121112222",
    endereco: "Avenida Paulista, 326, conjunto 95, Bela Vista, São Paulo, SP",
    url,
  });
});

test("mapResponseToLead nunca inclui CPF no objeto retornado, mesmo que a API o envie", () => {
  const lead = mapResponseToLead(FULL_RESPONSE, "leila-aparecida-lopes", "https://x/leila-aparecida-lopes");
  assert.equal("cpf" in lead, false);
  assert.equal("professional_profile_cpf" in lead, false);
  assert.equal(Object.values(lead).includes("04377490885"), false);
});

test("mapResponseToLead retorna null quando professional está ausente", () => {
  assert.equal(mapResponseToLead({ data: { message: {} } }, "x", "https://x/x"), null);
  assert.equal(mapResponseToLead({}, "x", "https://x/x"), null);
});

test("mapResponseToLead retorna null quando professional não tem nome", () => {
  const resp = { data: { message: { professional: { council: {}, schema: {}, clinic: {} } } } };
  assert.equal(mapResponseToLead(resp, "x", "https://x/x"), null);
});

test("mapResponseToLead trata clinic/address ausentes sem lançar exceção", () => {
  const resp = { data: { message: { professional: { name: "Fulano", council: {}, schema: {} } } } };
  const lead = mapResponseToLead(resp, "fulano", "https://x/fulano");
  assert.equal(lead.telefone, null);
  assert.equal(lead.endereco, null);
  assert.equal(lead.crp, null);
});

test("filterRjLead: mantém lead com cidade -rj", () => {
  const lead = { fonte: "nossos_psicologos", slug: "x", nome: "X", cidade: "niteroi-rj" };
  assert.deepEqual(filterRjLead(lead), lead);
});

test("filterRjLead: descarta lead fora do RJ", () => {
  const lead = { fonte: "nossos_psicologos", slug: "x", nome: "X", cidade: "sao-paulo-sp" };
  assert.equal(filterRjLead(lead), null);
});

test("filterRjLead: repassa null sem lançar exceção", () => {
  assert.equal(filterRjLead(null), null);
});
