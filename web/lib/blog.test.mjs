import test from "node:test";
import assert from "node:assert/strict";
import { POR_PAGINA, paginar, escolherRelacionados } from "./blog.js";

test("POR_PAGINA: 12 artigos por pagina", () => {
  assert.equal(POR_PAGINA, 12);
});

test("paginar: primeira pagina", () => {
  assert.deepEqual(paginar(45, "1", 12), {
    pagina: 1,
    totalPaginas: 4,
    inicio: 0,
    fim: 11,
    anterior: null,
    proxima: 2,
    valida: true,
  });
});

test("paginar: sem parametro e a primeira pagina", () => {
  assert.equal(paginar(45, undefined, 12).pagina, 1);
  assert.equal(paginar(45, undefined, 12).valida, true);
});

test("paginar: ultima pagina nao tem proxima", () => {
  assert.deepEqual(paginar(45, "4", 12), {
    pagina: 4,
    totalPaginas: 4,
    inicio: 36,
    fim: 47,
    anterior: 3,
    proxima: null,
    valida: true,
  });
});

test("paginar: pagina fora do intervalo ou mal formada e invalida (vira 404, nao pagina duplicada)", () => {
  for (const ruim of ["5", "0", "-1", "abc", "1.5", "", " ", "01x"]) {
    assert.equal(paginar(45, ruim, 12).valida, false, `devia invalidar ${JSON.stringify(ruim)}`);
  }
});

test("paginar: lista vazia tem uma pagina valida e vazia", () => {
  assert.deepEqual(paginar(0, undefined, 12), {
    pagina: 1,
    totalPaginas: 1,
    inicio: 0,
    fim: 11,
    anterior: null,
    proxima: null,
    valida: true,
  });
  assert.equal(paginar(0, "2", 12).valida, false);
});

test("paginar: total exato de uma pagina", () => {
  assert.equal(paginar(12, "1", 12).totalPaginas, 1);
  assert.equal(paginar(13, "1", 12).totalPaginas, 2);
});

const todos = [
  { id: 1, slug: "a", publicado_em: "2026-10-01T00:00:00Z", categorias: [{ slug: "ansiedade" }] },
  { id: 2, slug: "b", publicado_em: "2026-10-05T00:00:00Z", categorias: [{ slug: "luto" }] },
  { id: 3, slug: "c", publicado_em: "2026-10-03T00:00:00Z", categorias: [{ slug: "ansiedade" }, { slug: "luto" }] },
  { id: 4, slug: "d", publicado_em: "2026-10-09T00:00:00Z", categorias: [] },
  { id: 5, slug: "e", publicado_em: "2026-10-07T00:00:00Z", categorias: [{ slug: "outra" }] },
];

test("escolherRelacionados: mais categorias em comum primeiro, depois o mais recente", () => {
  const atual = { id: 1, categorias: [{ slug: "ansiedade" }, { slug: "luto" }] };
  assert.deepEqual(
    escolherRelacionados(atual, todos, 3).map((a) => a.slug),
    ["c", "b", "d"],
  );
});

test("escolherRelacionados: nunca devolve o proprio artigo e respeita o limite", () => {
  const atual = { id: 3, categorias: [{ slug: "ansiedade" }, { slug: "luto" }] };
  const r = escolherRelacionados(atual, todos, 2);
  assert.equal(r.length, 2);
  assert.ok(r.every((a) => a.id !== 3));
});

test("escolherRelacionados: completa com os mais recentes quando falta categoria em comum", () => {
  const atual = { id: 4, categorias: [] };
  assert.deepEqual(
    escolherRelacionados(atual, todos, 3).map((a) => a.slug),
    ["e", "b", "c"],
  );
});

test("escolherRelacionados: sem candidatos devolve lista vazia", () => {
  assert.deepEqual(escolherRelacionados({ id: 1, categorias: [] }, [{ id: 1, categorias: [] }], 3), []);
  assert.deepEqual(escolherRelacionados({ id: 1, categorias: [] }, [], 3), []);
});
