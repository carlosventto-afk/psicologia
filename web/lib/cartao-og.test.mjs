import test from "node:test";
import assert from "node:assert/strict";
import { limitarTitulo, tamanhoDoTitulo, cartaoArtigo, LARGURA, ALTURA } from "./cartao-og.js";

test("cartao 1200x630", () => {
  assert.equal(LARGURA, 1200);
  assert.equal(ALTURA, 630);
});

test("limitarTitulo: junta espacos e quebras de linha", () => {
  assert.equal(limitarTitulo("  muito   espaco \n aqui  "), "muito espaco aqui");
});

test("limitarTitulo: titulo longo e cortado na palavra com reticencias, dentro do limite", () => {
  const longo = "palavra ".repeat(40);
  const r = limitarTitulo(longo, 150);
  assert.ok(r.length <= 150, `tem ${r.length} caracteres`);
  assert.ok(r.endsWith("…"));
  assert.ok(!r.endsWith(" …"), "nao deve sobrar espaco antes das reticencias");
});

test("limitarTitulo: titulo que cabe volta inteiro", () => {
  assert.equal(limitarTitulo("Ansiedade no trabalho: o que fazer?", 150), "Ansiedade no trabalho: o que fazer?");
});

test("limitarTitulo: sem titulo vira texto vazio (nunca 'undefined')", () => {
  assert.equal(limitarTitulo(undefined), "");
  assert.equal(limitarTitulo(null), "");
});

test("tamanhoDoTitulo: quanto maior o titulo, menor a fonte", () => {
  const tamanhos = [20, 60, 90, 120, 150].map((n) => tamanhoDoTitulo("a".repeat(n)));
  assert.deepEqual(tamanhos, [78, 68, 58, 50, 44]);
  for (let i = 1; i < tamanhos.length; i += 1) assert.ok(tamanhos[i] < tamanhos[i - 1]);
});

// Percorre a arvore de elementos do cartao e junta todos os textos.
function textos(no) {
  if (no == null || typeof no === "boolean") return [];
  if (typeof no === "string") return [no];
  if (Array.isArray(no)) return no.flatMap(textos);
  return textos(no.props?.children);
}

test("cartaoArtigo: mostra a marca, a categoria e o titulo (limitado)", () => {
  const arvore = cartaoArtigo({ titulo: "Ansiedade no trabalho", categoria: "Ansiedade" });
  const todos = textos(arvore);
  assert.ok(todos.includes("PsiAgente"));
  assert.ok(todos.includes("Ansiedade"));
  assert.ok(todos.includes("Ansiedade no trabalho"));
  assert.ok(todos.includes("blog.psiagente.com.br"));
});

test("cartaoArtigo: sem categoria usa o nome do blog como selo", () => {
  const todos = textos(cartaoArtigo({ titulo: "Luto", categoria: undefined }));
  assert.ok(todos.includes("Blog"));
  assert.ok(!todos.includes("undefined"));
});

test("cartaoArtigo: todo elemento com mais de um filho declara display flex (exigencia do Satori)", () => {
  function confere(no) {
    if (no == null || typeof no !== "object") return;
    if (Array.isArray(no)) return no.forEach(confere);
    const filhos = no.props?.children;
    if (Array.isArray(filhos) && filhos.length > 1) {
      assert.equal(no.props.style?.display, "flex", `<${no.type}> com varios filhos sem display:flex`);
    }
    confere(filhos);
  }
  confere(cartaoArtigo({ titulo: "Titulo", categoria: "Cat" }));
  confere(cartaoArtigo({ titulo: "Titulo", categoria: undefined }));
});
