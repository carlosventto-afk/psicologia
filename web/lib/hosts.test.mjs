import test from "node:test";
import assert from "node:assert/strict";
import {
  DOMINIO,
  nomeDoHost,
  classificarHost,
  ehHostLocal,
  destinoSemWww,
  deveRastrearVisita,
  dentroDoPrefixo,
} from "./hosts.js";

test("dentroDoPrefixo: o prefixo exato ou um caminho dentro dele, nunca um nome que so comeca igual", () => {
  assert.equal(dentroDoPrefixo("/blog", "/blog"), true);
  assert.equal(dentroDoPrefixo("/blog/artigo", "/blog"), true);
  assert.equal(dentroDoPrefixo("/busca/ir/1", "/busca"), true);
  assert.equal(dentroDoPrefixo("/comece/", "/comece"), true);
  // artigo cujo slug comeca com "blog": nao pode ser tratado como rota interna
  assert.equal(dentroDoPrefixo("/blog-de-psicologia", "/blog"), false);
  assert.equal(dentroDoPrefixo("/blogger", "/blog"), false);
  assert.equal(dentroDoPrefixo("/", "/blog"), false);
});

test("nomeDoHost: minusculo e sem porta", () => {
  assert.equal(nomeDoHost("Blog.PsiAgente.com.br:3000"), "blog.psiagente.com.br");
  assert.equal(nomeDoHost("localhost:3100"), "localhost");
  assert.equal(nomeDoHost("[::1]:3000"), "[::1]");
  assert.equal(nomeDoHost(undefined), "");
  assert.equal(nomeDoHost(null), "");
});

test("classificarHost: separa site, www, blog, busca e comece", () => {
  assert.equal(classificarHost("psiagente.com.br"), "site");
  assert.equal(classificarHost("www.psiagente.com.br"), "www");
  assert.equal(classificarHost("blog.psiagente.com.br"), "blog");
  assert.equal(classificarHost("busca.psiagente.com.br"), "busca");
  assert.equal(classificarHost("comece.psiagente.com.br"), "comece");
  assert.equal(classificarHost("blog.localhost:3000"), "blog");
  assert.equal(classificarHost("localhost:3000"), "site");
  assert.equal(classificarHost(""), "site");
});

test("ehHostLocal: localhost, subdominios de localhost, loopback e IP puro", () => {
  assert.equal(ehHostLocal("localhost:3100"), true);
  assert.equal(ehHostLocal("blog.localhost:3000"), true);
  assert.equal(ehHostLocal("comece.localhost"), true);
  assert.equal(ehHostLocal("127.0.0.1:3000"), true);
  assert.equal(ehHostLocal("[::1]:3000"), true);
  assert.equal(ehHostLocal("0.0.0.0:3000"), true);
  assert.equal(ehHostLocal("179.198.103.130"), true);
  assert.equal(ehHostLocal(""), true);
  assert.equal(ehHostLocal(undefined), true);
  assert.equal(ehHostLocal("psiagente.com.br"), false);
  assert.equal(ehHostLocal("blog.psiagente.com.br"), false);
  assert.equal(ehHostLocal("www.psiagente.com.br"), false);
});

test("destinoSemWww: so o www do dominio principal tem destino", () => {
  assert.equal(DOMINIO, "psiagente.com.br");
  assert.equal(destinoSemWww("www.psiagente.com.br"), "psiagente.com.br");
  assert.equal(destinoSemWww("WWW.PsiAgente.com.br:443"), "psiagente.com.br");
  assert.equal(destinoSemWww("psiagente.com.br"), null);
  assert.equal(destinoSemWww("blog.psiagente.com.br"), null);
  assert.equal(destinoSemWww("www.outro.com.br"), null);
  assert.equal(destinoSemWww(undefined), null);
});

test("deveRastrearVisita: funil do site principal e subdominios publicos", () => {
  assert.equal(deveRastrearVisita("psiagente.com.br", "/"), true);
  assert.equal(deveRastrearVisita("psiagente.com.br", "/login"), true);
  assert.equal(deveRastrearVisita("psiagente.com.br", "/cadastro"), true);
  assert.equal(deveRastrearVisita("psiagente.com.br", "/comparativo"), true);
  assert.equal(deveRastrearVisita("psiagente.com.br", "/pacientes"), false);
  assert.equal(deveRastrearVisita("psiagente.com.br", "/painel"), false);
  assert.equal(deveRastrearVisita("blog.psiagente.com.br", "/qualquer-artigo"), true);
  assert.equal(deveRastrearVisita("busca.psiagente.com.br", "/ana"), true);
  assert.equal(deveRastrearVisita("comece.psiagente.com.br", "/"), true);
});

test("deveRastrearVisita: hosts locais e IP puro nao entram na analise de visitas", () => {
  assert.equal(deveRastrearVisita("localhost:3100", "/"), false);
  assert.equal(deveRastrearVisita("blog.localhost:3000", "/artigo"), false);
  assert.equal(deveRastrearVisita("comece.localhost:3000", "/"), false);
  assert.equal(deveRastrearVisita("busca.localhost", "/"), false);
  assert.equal(deveRastrearVisita("127.0.0.1:3000", "/login"), false);
  assert.equal(deveRastrearVisita("179.198.103.130", "/"), false);
});
