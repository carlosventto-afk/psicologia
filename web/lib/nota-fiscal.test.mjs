import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarListaDatas,
  montarDescricaoNota,
  competenciaDaNota,
  escolherTomador,
  validarPreCondicoes,
  canaisDeEntrega,
  MOTIVOS,
} from "./nota-fiscal.js";

test("formatarListaDatas: uma, duas e três datas", () => {
  assert.equal(formatarListaDatas(["2026-05-13"]), "13/05/2026");
  assert.equal(formatarListaDatas(["2026-05-20", "2026-05-13"]), "13/05/2026 e 20/05/2026");
  assert.equal(
    formatarListaDatas(["2026-05-27", "2026-05-13", "2026-05-20"]),
    "13/05/2026, 20/05/2026 e 27/05/2026",
  );
});

test("formatarListaDatas: ordena e remove duplicadas", () => {
  assert.equal(
    formatarListaDatas(["2026-05-20", "2026-05-13", "2026-05-20", "2026-05-13"]),
    "13/05/2026 e 20/05/2026",
  );
  assert.equal(formatarListaDatas(["2026-05-13", "2026-05-13"]), "13/05/2026");
});

test("montarDescricaoNota: uma data", () => {
  assert.equal(
    montarDescricaoNota({ datasISO: ["2026-05-13"], nomeProfissional: "Ana Silva", crp: "06/12345" }),
    "Atendimento(s) psicológico(s) em 13/05/2026.\n\nServiço prestado por:\nAna Silva\nCRP: 06/12345",
  );
});

test("montarDescricaoNota: três datas", () => {
  assert.equal(
    montarDescricaoNota({
      datasISO: ["2026-05-27", "2026-05-13", "2026-05-20"],
      nomeProfissional: "Ana Silva",
      crp: "06/12345",
    }),
    "Atendimento(s) psicológico(s) em 13/05/2026, 20/05/2026 e 27/05/2026.\n\nServiço prestado por:\nAna Silva\nCRP: 06/12345",
  );
});

test("competenciaDaNota: maior data; erro em lista vazia", () => {
  assert.equal(competenciaDaNota(["2026-05-13", "2026-06-02", "2026-05-27"]), "2026-06-02");
  assert.throws(() => competenciaDaNota([]), /vazia/i);
});

const paciente = { nome: "Paulo", cpf: "123.456.789-09", email: "p@x.com", telefone: "11999990000" };

test("escolherTomador: responsável quando existe, com documento só dígitos", () => {
  const t = escolherTomador({
    responsavel: { nome: "Maria", cpf_cnpj: "12.345.678/0001-95", email: "m@x.com", telefone: "11988887777" },
    paciente,
  });
  assert.deepEqual(t, {
    nome: "Maria",
    documento: "12345678000195",
    email: "m@x.com",
    telefone: "11988887777",
    origem: "responsavel",
  });
});

test("escolherTomador: paciente sem responsável (null ou undefined)", () => {
  const esperado = {
    nome: "Paulo",
    documento: "12345678909",
    email: "p@x.com",
    telefone: "11999990000",
    origem: "paciente",
  };
  assert.deepEqual(escolherTomador({ responsavel: null, paciente }), esperado);
  assert.deepEqual(escolherTomador({ paciente }), esperado);
});

test("escolherTomador: sem documento válido", () => {
  assert.deepEqual(escolherTomador({ responsavel: null, paciente: { ...paciente, cpf: null } }), {
    erro: "sem_documento",
    origem: "paciente",
  });
  assert.deepEqual(escolherTomador({ responsavel: { nome: "M", cpf_cnpj: "123" }, paciente }), {
    erro: "sem_documento",
    origem: "responsavel",
  });
});

const fiscal = { certificado_pfx_cifrado: "abc", certificado_validade: "2027-01-01" };
const usuario = { crp: "06/12345" };
const tomadorOk = { nome: "P", documento: "12345678909", origem: "paciente" };
const hoje = "2026-11-12";

test("validarPreCondicoes: ok", () => {
  assert.deepEqual(validarPreCondicoes({ fiscal, usuario, tomador: tomadorOk, hoje }), { ok: true });
});

test("validarPreCondicoes: cada motivo", () => {
  assert.deepEqual(validarPreCondicoes({ fiscal: null, usuario, tomador: tomadorOk, hoje }), {
    ok: false,
    motivo: "Configure seus dados fiscais em Configurações → NFS-e.",
  });
  assert.deepEqual(
    validarPreCondicoes({ fiscal: { ...fiscal, certificado_pfx_cifrado: null }, usuario, tomador: tomadorOk, hoje }),
    { ok: false, motivo: MOTIVOS.certificadoAusente },
  );
  assert.match(MOTIVOS.certificadoAusente, /certificado/i);
  assert.deepEqual(
    validarPreCondicoes({ fiscal: { ...fiscal, certificado_validade: "2026-11-11" }, usuario, tomador: tomadorOk, hoje }),
    { ok: false, motivo: MOTIVOS.certificadoVencido },
  );
  assert.match(MOTIVOS.certificadoVencido, /vencido/i);
  assert.deepEqual(validarPreCondicoes({ fiscal, usuario: { crp: "  " }, tomador: tomadorOk, hoje }), {
    ok: false,
    motivo: "Cadastre seu CRP em Meus Dados.",
  });
  assert.equal(validarPreCondicoes({ fiscal, usuario: {}, tomador: tomadorOk, hoje }).ok, false);
  assert.deepEqual(
    validarPreCondicoes({ fiscal, usuario, tomador: { erro: "sem_documento", origem: "paciente" }, hoje }),
    { ok: false, motivo: "O tomador da nota (responsável financeiro ou paciente) não tem CPF/CNPJ cadastrado." },
  );
});

test("validarPreCondicoes: certificado que vence hoje ainda vale", () => {
  const r = validarPreCondicoes({
    fiscal: { ...fiscal, certificado_validade: "2026-11-12" },
    usuario,
    tomador: tomadorOk,
    hoje,
  });
  assert.equal(r.ok, true);
});

test("canaisDeEntrega: matriz", () => {
  const tomador = { email: "a@b.com", telefone: "(11) 98888-7777" };
  const base = { ambiente: "producao", tomador, optInWhatsapp: true, jaEnviadoEmail: false, jaEnviadoWhatsapp: false };
  assert.deepEqual(canaisDeEntrega({ ...base, ambiente: "homologacao" }), { email: false, whatsapp: false });
  assert.deepEqual(canaisDeEntrega({ ...base, optInWhatsapp: false }), { email: true, whatsapp: false });
  assert.deepEqual(canaisDeEntrega(base), { email: true, whatsapp: true });
  assert.deepEqual(canaisDeEntrega({ ...base, jaEnviadoEmail: true, jaEnviadoWhatsapp: true }), {
    email: false,
    whatsapp: false,
  });
  assert.deepEqual(canaisDeEntrega({ ...base, jaEnviadoEmail: true }), { email: false, whatsapp: true });
  assert.deepEqual(canaisDeEntrega({ ...base, tomador: { email: "", telefone: "123456789" } }), {
    email: false,
    whatsapp: false,
  });
  assert.deepEqual(canaisDeEntrega({ ...base, tomador: { email: null, telefone: null } }), {
    email: false,
    whatsapp: false,
  });
});
