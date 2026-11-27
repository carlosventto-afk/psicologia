import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarIdsDoLote,
  emPartes,
  planejarPublicacao,
  resumirLote,
  publicarRascunhos,
} from "./publicacao-lote.js";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

// Linha como o select de rascunhos a devolve (todas as colunas pedidas).
const rascunho = (id, criadoEm, extra = {}) => ({
  id,
  titulo: `Artigo ${id}`,
  slug: `artigo-${id}`,
  publicado_em: null,
  criado_em: criadoEm,
  ...extra,
});

const AGORA = new Date("2026-11-26T15:00:00.000Z");

test("normalizarIdsDoLote: so ficam UUIDs validos, sem repeticao (mesmo em caixa diferente), na ordem de chegada", () => {
  const entrada = [
    ID_B,
    "nao-e-um-uuid",
    ID_A.toUpperCase(),
    ID_B,
    ID_A,
    "",
    null,
    undefined,
    42,
    // tentativa de injetar um filtro a mais no .in() do PostgREST
    `${ID_A},publicado.eq.true`,
    { id: ID_A },
  ];
  assert.deepEqual(normalizarIdsDoLote(entrada), [ID_B, ID_A]);
});

test("normalizarIdsDoLote: o que nao e lista vira lista vazia", () => {
  for (const ruim of [undefined, null, "", ID_A, 7, { 0: ID_A }]) {
    assert.deepEqual(normalizarIdsDoLote(ruim), [], `devia ser [] para ${JSON.stringify(ruim)}`);
  }
});

test("emPartes: divide em blocos do tamanho pedido e o ultimo leva o que sobrou", () => {
  assert.deepEqual(emPartes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(emPartes([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.deepEqual(emPartes([], 3), []);
});

test("planejarPublicacao: a ordem de criacao vira a de publicacao, sem empate de segundo e sem data no futuro", () => {
  const plano = planejarPublicacao(
    [
      rascunho("c", "2026-11-26T12:00:00+00:00"),
      rascunho("a", "2026-11-26T10:00:00+00:00"),
      rascunho("b", "2026-11-26T11:00:00+00:00"),
    ],
    AGORA
  );

  assert.deepEqual(plano.map((p) => p.id), ["a", "b", "c"]);

  // O feed RSS so tem precisao de segundo: cada artigo precisa cair num segundo proprio.
  const segundos = plano.map((p) => Math.floor(Date.parse(p.publicado_em) / 1000));
  assert.ok(segundos[0] < segundos[1] && segundos[1] < segundos[2], `segundos: ${segundos}`);

  // O mais novo e publicado "agora"; nenhum passa disso (atualizado_em = agora nao pode ficar antes de publicado_em).
  assert.equal(plano[2].publicado_em, "2026-11-26T15:00:00.000Z");
  assert.ok(plano.every((p) => Date.parse(p.publicado_em) <= AGORA.getTime()));
});

test("planejarPublicacao: quem ja foi publicado antes mantem a data original", () => {
  const plano = planejarPublicacao(
    [
      rascunho("velho", "2026-09-01T10:00:00+00:00", { publicado_em: "2026-09-02T09:00:00+00:00" }),
      rascunho("novo", "2026-11-25T10:00:00+00:00"),
    ],
    AGORA
  );

  assert.equal(plano.find((p) => p.id === "velho").publicado_em, "2026-09-02T09:00:00+00:00");
  assert.equal(plano.find((p) => p.id === "novo").publicado_em, "2026-11-26T15:00:00.000Z");
});

test("planejarPublicacao: criados no mesmo instante desempatam pelo id, qualquer que seja a ordem de entrada", () => {
  const instante = "2026-11-25T10:00:00+00:00";
  const ida = planejarPublicacao([rascunho("b", instante), rascunho("a", instante)], AGORA);
  const volta = planejarPublicacao([rascunho("a", instante), rascunho("b", instante)], AGORA);

  assert.deepEqual(ida.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(volta.map((p) => p.id), ["a", "b"]);
});

test("planejarPublicacao: devolve so o necessario para atualizar e nao altera a lista recebida", () => {
  const entrada = [
    rascunho("c", "2026-11-26T12:00:00+00:00"),
    rascunho("a", "2026-11-26T10:00:00+00:00"),
  ];
  const copia = structuredClone(entrada);

  const plano = planejarPublicacao(entrada, AGORA);

  assert.deepEqual(entrada, copia);
  assert.deepEqual(Object.keys(plano[0]).sort(), ["id", "publicado_em", "slug", "titulo"]);
});

const item = (n, titulo = `Artigo ${n}`) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  titulo,
  slug: `artigo-${n}`,
  publicado_em: "2026-11-26T15:00:00.000Z",
});

test("resumirLote: tudo publicado vira so a mensagem de sucesso, no singular ou no plural", () => {
  assert.deepEqual(resumirLote({ publicados: [item(1)], falhas: [], ignorados: 0 }), {
    sucesso: "1 artigo publicado.",
  });
  assert.deepEqual(resumirLote({ publicados: [item(1), item(2), item(3)], falhas: [], ignorados: 0 }), {
    sucesso: "3 artigos publicados.",
  });
});

test("resumirLote: falhas viram erro que cita ate 3 titulos e diz quantos ficaram de fora, sem esconder o que deu certo", () => {
  const falhas = ["Um", "Dois", "Tres", "Quatro", "Cinco"].map((titulo, i) => item(i + 1, titulo));
  const resumo = resumirLote({ publicados: [item(9, "Ok")], falhas, ignorados: 0 });

  assert.equal(resumo.sucesso, "1 artigo publicado.");
  assert.match(resumo.error, /^5 artigos não foram publicados: /);
  for (const titulo of ["Um", "Dois", "Tres"]) {
    assert.ok(resumo.error.includes(`“${titulo}”`), `faltou ${titulo} em: ${resumo.error}`);
  }
  assert.ok(!resumo.error.includes("Quatro"), resumo.error);
  assert.match(resumo.error, /e mais 2\.$/);

  const uma = resumirLote({ publicados: [], falhas: [item(1, "Solto")], ignorados: 0 });
  assert.equal(uma.sucesso, undefined);
  assert.match(uma.error, /^1 artigo não foi publicado: “Solto”\.$/);
});

test("resumirLote: artigos que ja estavam publicados viram aviso, nunca erro", () => {
  const soIgnorados = resumirLote({ publicados: [], falhas: [], ignorados: 2 });
  assert.equal(soIgnorados.sucesso, undefined);
  assert.equal(soIgnorados.error, undefined);
  assert.match(soIgnorados.aviso, /^2 artigos já estavam publicados/);

  const misto = resumirLote({ publicados: [item(1), item(2)], falhas: [], ignorados: 1 });
  assert.equal(misto.sucesso, "2 artigos publicados.");
  assert.match(misto.aviso, /^1 artigo já estava publicado/);
  assert.equal(misto.error, undefined);
});

// ---------------------------------------------------------------------------
// publicarRascunhos: o banco e uma tabela em memoria que imita o que o PostgREST
// faz com a cadeia usada pelo codigo. Os filtros .in/.eq valem de verdade, o
// select devolve so as colunas pedidas e um update sem .select() nao devolve
// linhas. O smoke (scripts/smoke-publicar-lote.mjs) confere o mesmo contra o
// Supabase real.
// ---------------------------------------------------------------------------

function criarBanco(
  linhas,
  { erroNaLeitura = false, erroNoUpdate = [], excecaoNoUpdate = [], updateSemEfeito = [], aposLeitura = () => {} } = {}
) {
  const tabela = linhas.map((l) => ({ ...l }));
  const leituras = []; // { ids } de cada select emitido
  const atualizacoes = []; // { id, patch } de cada update emitido

  const projetar = (linha, colunas) =>
    Object.fromEntries(
      colunas
        .split(",")
        .map((c) => c.trim())
        .map((c) => [c, linha[c]])
    );

  async function executar(q) {
    const alvo = tabela.filter((l) => q.filtros.every((filtro) => filtro(l)));

    if (q.modo === "select") {
      leituras.push({ ids: q.ids });
      if (erroNaLeitura) return { data: null, error: { message: "falha simulada na leitura" } };
      const data = alvo.map((l) => projetar(l, q.colunas));
      aposLeitura(tabela);
      return { data, error: null };
    }

    atualizacoes.push({ id: q.idUnico, patch: q.patch });
    if (excecaoNoUpdate.includes(q.idUnico)) throw new Error("conexao caiu");
    if (erroNoUpdate.includes(q.idUnico)) return { data: null, error: { message: "falha simulada no update" } };
    // Como o RLS: nao da erro, so nao enxerga a linha.
    if (updateSemEfeito.includes(q.idUnico)) return { data: [], error: null };
    alvo.forEach((l) => Object.assign(l, q.patch));
    return { data: q.colunas ? alvo.map((l) => projetar(l, q.colunas)) : null, error: null };
  }

  function consulta(modo, patch = null) {
    const q = { modo, patch, colunas: null, filtros: [], ids: null, idUnico: null };
    const api = {
      select(colunas) {
        q.colunas = colunas;
        return api;
      },
      in(coluna, valores) {
        q.filtros.push((l) => valores.includes(l[coluna]));
        if (coluna === "id") q.ids = valores;
        return api;
      },
      eq(coluna, valor) {
        q.filtros.push((l) => l[coluna] === valor);
        if (coluna === "id") q.idUnico = valor;
        return api;
      },
      then(resolve, reject) {
        return executar(q).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    from(nome) {
      assert.equal(nome, "artigos");
      return {
        select: (colunas) => consulta("select").select(colunas),
        update: (patch) => consulta("update", patch),
      };
    },
    tabela,
    leituras,
    atualizacoes,
  };
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Linha da tabela `artigos` completa, com as colunas que o codigo nao le tambem.
const linhaDoBanco = (n, extra = {}) => ({
  id: uuid(n),
  titulo: `Artigo ${n}`,
  slug: `artigo-${n}`,
  resumo: null,
  conteudo: "texto",
  autor: null,
  imagem_capa: null,
  publicado: false,
  publicado_em: null,
  criado_em: new Date(Date.UTC(2026, 10, 1, 0, 0, n)).toISOString(),
  atualizado_em: "2026-11-01T00:00:00.000Z",
  ...extra,
});

const doBanco = (banco, n) => banco.tabela.find((l) => l.id === uuid(n));

test("publicarRascunhos: publica so os rascunhos pedidos e grava publicado, publicado_em e atualizado_em", async () => {
  const banco = criarBanco([
    linhaDoBanco(1), // pedido
    linhaDoBanco(2), // pedido
    linhaDoBanco(3), // rascunho que ninguem pediu
    linhaDoBanco(4, {
      publicado: true,
      publicado_em: "2026-10-10T10:00:00+00:00",
      atualizado_em: "2026-10-10T10:00:00+00:00",
    }), // pedido, mas ja estava publicado
  ]);

  const resultado = await publicarRascunhos(banco, [uuid(1), uuid(2), uuid(4), uuid(99), "lixo"], AGORA);

  assert.deepEqual(resultado.publicados.map((p) => p.id), [uuid(1), uuid(2)]);
  assert.deepEqual(resultado.falhas, []);
  // O 4 (ja publicado) e o 99 (nao existe) sao ignorados; "lixo" nem chega a contar.
  assert.equal(resultado.ignorados, 2);

  assert.equal(doBanco(banco, 1).publicado, true);
  assert.equal(doBanco(banco, 2).publicado, true);
  assert.ok(Date.parse(doBanco(banco, 1).publicado_em) < Date.parse(doBanco(banco, 2).publicado_em));
  assert.equal(doBanco(banco, 2).publicado_em, "2026-11-26T15:00:00.000Z");
  assert.equal(doBanco(banco, 1).atualizado_em, "2026-11-26T15:00:00.000Z");
  assert.equal(doBanco(banco, 2).atualizado_em, "2026-11-26T15:00:00.000Z");

  assert.equal(doBanco(banco, 3).publicado, false);
  assert.equal(doBanco(banco, 3).publicado_em, null);
  assert.equal(doBanco(banco, 4).publicado_em, "2026-10-10T10:00:00+00:00");
  assert.equal(doBanco(banco, 4).atualizado_em, "2026-10-10T10:00:00+00:00");
});

test("publicarRascunhos: falha em um artigo (erro do banco ou conexao caida) nao impede os outros e ele aparece em falhas", async () => {
  const banco = criarBanco([1, 2, 3, 4].map((n) => linhaDoBanco(n)), {
    erroNoUpdate: [uuid(2)],
    excecaoNoUpdate: [uuid(3)],
  });

  const resultado = await publicarRascunhos(banco, [1, 2, 3, 4].map(uuid), AGORA);

  assert.deepEqual(resultado.publicados.map((p) => p.id).sort(), [uuid(1), uuid(4)]);
  assert.deepEqual(resultado.falhas.map((f) => f.titulo).sort(), ["Artigo 2", "Artigo 3"]);
  assert.equal(doBanco(banco, 1).publicado, true);
  assert.equal(doBanco(banco, 2).publicado, false);
  assert.equal(doBanco(banco, 3).publicado, false);
  assert.equal(doBanco(banco, 4).publicado, true);
});

test("publicarRascunhos: update que nao altera linha nenhuma (o que o RLS faz, sem erro) conta como falha, nunca como publicado", async () => {
  const banco = criarBanco([linhaDoBanco(1), linhaDoBanco(2)], { updateSemEfeito: [uuid(2)] });

  const resultado = await publicarRascunhos(banco, [uuid(1), uuid(2)], AGORA);

  assert.deepEqual(resultado.publicados.map((p) => p.id), [uuid(1)]);
  assert.deepEqual(resultado.falhas.map((f) => f.id), [uuid(2)]);
});

test("publicarRascunhos: artigo publicado por outra pessoa entre a leitura e a gravacao nao e sobrescrito", async () => {
  const banco = criarBanco([linhaDoBanco(1), linhaDoBanco(2)], {
    aposLeitura: (tabela) =>
      Object.assign(tabela.find((l) => l.id === uuid(2)), {
        publicado: true,
        publicado_em: "2026-11-26T14:00:00+00:00",
      }),
  });

  const resultado = await publicarRascunhos(banco, [uuid(1), uuid(2)], AGORA);

  assert.deepEqual(resultado.publicados.map((p) => p.id), [uuid(1)]);
  assert.equal(doBanco(banco, 2).publicado_em, "2026-11-26T14:00:00+00:00");
});

test("publicarRascunhos: le os rascunhos em varios blocos (URL curta no PostgREST) e atualiza cada artigo exatamente uma vez", async () => {
  const numeros = Array.from({ length: 120 }, (_, i) => i + 1);
  const banco = criarBanco(numeros.map((n) => linhaDoBanco(n)));

  const resultado = await publicarRascunhos(banco, numeros.map(uuid), AGORA);

  const tamanhos = banco.leituras.map((l) => l.ids.length);
  assert.ok(tamanhos.length > 1, `devia ler em mais de um bloco: ${tamanhos}`);
  assert.ok(Math.max(...tamanhos) <= 100, `bloco grande demais: ${tamanhos}`);
  assert.equal(
    tamanhos.reduce((a, b) => a + b, 0),
    120
  );

  assert.equal(resultado.publicados.length, 120);
  assert.equal(banco.atualizacoes.length, 120);
  assert.equal(new Set(banco.atualizacoes.map((a) => a.id)).size, 120);
  assert.ok(banco.tabela.every((l) => l.publicado === true));
});

test("publicarRascunhos: erro ao ler os rascunhos interrompe tudo, sem gravar nada", async () => {
  const banco = criarBanco([linhaDoBanco(1)], { erroNaLeitura: true });

  await assert.rejects(() => publicarRascunhos(banco, [uuid(1)], AGORA), /falha simulada na leitura/);

  assert.equal(banco.atualizacoes.length, 0);
  assert.equal(doBanco(banco, 1).publicado, false);
});

test("publicarRascunhos: ids que nao sao UUID nao chegam ao banco", async () => {
  const banco = criarBanco([linhaDoBanco(1)]);

  const resultado = await publicarRascunhos(banco, ["lixo", `${uuid(1)},publicado.eq.true`], AGORA);

  assert.equal(banco.leituras.length, 0);
  assert.equal(banco.atualizacoes.length, 0);
  assert.deepEqual(resultado, { publicados: [], falhas: [], ignorados: 0 });
});
