import test from "node:test";
import assert from "node:assert/strict";
import { entregarNota } from "./nfse-entrega.js";

// Fake mínimo de Supabase: tabelas em memória, query builder encadeável.
function criarFake({ nota = {}, ambiente = "producao", ambienteProfissional = ambiente, optIn = true, claimZero = {} } = {}) {
  const tabelas = {
    NotaFiscal: [
      {
        id: 1,
        owner: "u1",
        status: "autorizada",
        ambiente,
        cobranca: 10,
        recebimento_sessao: null,
        chave_acesso: "CHAVE123",
        xml_nfse: "<nfse/>",
        pdf_base64: "UERG",
        tomador_nome: "Maria",
        tomador_email: "m@x.com",
        tomador_telefone: "(91) 98191-0295",
        enviada_email_em: null,
        enviada_whatsapp_em: null,
        ultimo_erro: null,
        ...nota,
      },
    ],
    Cobranca: [{ id: 10, paciente: 5 }],
    DadosFiscaisProfissional: [{ owner: "u1", ambiente: ambienteProfissional }],
    Usuarios: [{ id_user: "u1", nome: "Ana Souza" }],
    Paciente: [{ id: 5, whatsapp_lembrete_opt_in: optIn }],
  };
  const updates = [];
  const from = (tabela) => {
    const filtros = [];
    let patch = null;
    const b = {
      select() {
        return b;
      },
      update(p) {
        patch = p;
        return b;
      },
      eq(c, v) {
        filtros.push([c, (l) => l[c] === v]);
        return b;
      },
      is(c, v) {
        filtros.push([c, (l) => l[c] === v, c]);
        return b;
      },
      _linhas() {
        return tabelas[tabela].filter((l) => filtros.every(([, f]) => f(l)));
      },
      maybeSingle() {
        return Promise.resolve({ data: b._linhas()[0] ?? null, error: null });
      },
      then(res, rej) {
        let linhas = b._linhas();
        if (patch) {
          const colunaClaim = Object.keys(patch).find((k) => k in claimZero);
          if (colunaClaim && patch[colunaClaim] !== null && claimZero[colunaClaim]) linhas = [];
          linhas.forEach((l) => Object.assign(l, patch));
          updates.push({ tabela, patch, linhas: linhas.length });
        }
        return Promise.resolve({ data: linhas.map((l) => ({ id: l.id })), error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { from, tabelas, updates, nota: () => tabelas.NotaFiscal[0] };
}

function senders({ falhaEmail = false } = {}) {
  const chamadas = { email: 0, documento: 0, texto: 0 };
  return {
    chamadas,
    enviarEmail: async () => {
      chamadas.email++;
      if (falhaEmail) throw new Error("smtp caiu");
    },
    enviarDocumento: async () => {
      chamadas.documento++;
      return { error: null };
    },
    enviarTexto: async () => {
      chamadas.texto++;
      return { error: null };
    },
  };
}

test("produção com os dois canais: ambos enviados e reivindicados", async () => {
  const fake = criarFake({ nota: { ultimo_erro: "antigo" } });
  const s = senders();
  const r = await entregarNota(fake, 1, s);
  assert.deepEqual(r, { email: "enviado", whatsapp: "enviado" });
  assert.deepEqual(s.chamadas, { email: 1, documento: 1, texto: 0 });
  assert.ok(fake.nota().enviada_email_em);
  assert.ok(fake.nota().enviada_whatsapp_em);
  assert.equal(fake.nota().ultimo_erro, null);
});

test("e-mail falha: reivindicação liberada, erro gravado e WhatsApp ainda enviado", async () => {
  const fake = criarFake();
  const s = senders({ falhaEmail: true });
  const r = await entregarNota(fake, 1, s);
  assert.deepEqual(r, { email: "falhou", whatsapp: "enviado" });
  assert.equal(fake.nota().enviada_email_em, null);
  assert.ok(fake.nota().enviada_whatsapp_em);
  assert.match(fake.nota().ultimo_erro, /e-mail: smtp caiu/);
});

test("claim sem linhas: canal pulado e nada enviado", async () => {
  const fake = criarFake({ claimZero: { enviada_email_em: true, enviada_whatsapp_em: true } });
  const s = senders();
  const r = await entregarNota(fake, 1, s);
  assert.deepEqual(r, { email: "pulado", whatsapp: "pulado" });
  assert.deepEqual(s.chamadas, { email: 0, documento: 0, texto: 0 });
});

test("homologação: tudo pulado", async () => {
  const fake = criarFake({ ambiente: "homologacao" });
  const s = senders();
  assert.deepEqual(await entregarNota(fake, 1, s), { email: "pulado", whatsapp: "pulado" });
  assert.deepEqual(s.chamadas, { email: 0, documento: 0, texto: 0 });
});

test("nota de homologação não é enviada mesmo com o profissional já em produção", async () => {
  const fake = criarFake({ ambiente: "homologacao", ambienteProfissional: "producao" });
  const s = senders();
  assert.deepEqual(await entregarNota(fake, 1, s), { email: "pulado", whatsapp: "pulado" });
  assert.deepEqual(s.chamadas, { email: 0, documento: 0, texto: 0 });
});

test("nota de produção é enviada mesmo se o profissional voltou para homologação", async () => {
  const fake = criarFake({ ambiente: "producao", ambienteProfissional: "homologacao" });
  const s = senders();
  assert.deepEqual(await entregarNota(fake, 1, s), { email: "enviado", whatsapp: "enviado" });
});

test("canal já enviado não é reenviado", async () => {
  const fake = criarFake({ nota: { enviada_email_em: "2026-11-12T10:00:00Z" } });
  const s = senders();
  const r = await entregarNota(fake, 1, s);
  assert.deepEqual(r, { email: "pulado", whatsapp: "enviado" });
  assert.equal(s.chamadas.email, 0);
});

test("sem PDF o WhatsApp vai como texto; sem XML o e-mail falha sem enviar", async () => {
  const fake = criarFake({ nota: { pdf_base64: null, xml_nfse: "" } });
  const s = senders();
  const r = await entregarNota(fake, 1, s);
  assert.deepEqual(r, { email: "falhou", whatsapp: "enviado" });
  assert.deepEqual(s.chamadas, { email: 0, documento: 0, texto: 1 });
  assert.equal(fake.nota().enviada_email_em, null);
});

test("nota não autorizada: tudo pulado", async () => {
  const fake = criarFake({ nota: { status: "pendente" } });
  assert.deepEqual(await entregarNota(fake, 1, senders()), { email: "pulado", whatsapp: "pulado" });
});
