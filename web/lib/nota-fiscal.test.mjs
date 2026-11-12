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
  somarValores,
  notasAtivas,
  contarRejeitadas,
  planejarNotas,
  montarPayloadEmissao,
  montarAtualizacaoResultado,
  montarAtualizacaoFalha,
  classificarResultadoEmissao,
  montarAtualizacaoIncerta,
  validarCompetencias,
  responsavelParaTomador,
  itensSemNotaAtiva,
  tentativasDoItem,
  MENSAGEM_INCERTA,
  MOTIVO_COMPETENCIA_FUTURA,
} from "./nota-fiscal.js";

test("somarValores: centavos sem erro de ponto flutuante", () => {
  assert.equal(somarValores([0.1, 0.2]), 0.3);
  assert.equal(somarValores(["150.10", 150.2, 99.7]), 400);
  assert.equal(somarValores([]), 0);
});

test("notasAtivas e contarRejeitadas", () => {
  const notas = [{ status: "rejeitada" }, { status: "cancelada" }, { status: "autorizada" }, { status: "pendente" }];
  assert.equal(notasAtivas(notas).length, 2);
  assert.equal(contarRejeitadas(notas), 1);
});

test("planejarNotas: modo cobrança gera uma nota somada", () => {
  const p = planejarNotas({
    emissaoPor: "cobranca",
    rateios: [
      { id: 1, valor_aplicado: 0.1, data: "2026-05-20" },
      { id: 2, valor_aplicado: 0.2, data: "2026-05-13" },
    ],
  });
  assert.equal(p.length, 1);
  assert.equal(p[0].valor, 0.3);
  assert.equal(p[0].competencia, "2026-05-20");
  assert.deepEqual(p[0].datasISO, ["2026-05-20", "2026-05-13"]);
  assert.equal(p[0].recebimentoSessao, null);
});

test("planejarNotas: modo sessão gera uma nota por rateio", () => {
  const p = planejarNotas({
    emissaoPor: "sessao",
    rateios: [
      { id: 7, valor_aplicado: "100", data: "2026-05-20" },
      { id: 8, valor_aplicado: "80.5", data: "2026-05-13" },
    ],
  });
  assert.deepEqual(
    p.map((n) => [n.recebimentoSessao, n.valor, n.competencia, n.datasISO.length]),
    [[7, 100, "2026-05-20", 1], [8, 80.5, "2026-05-13", 1]],
  );
});

test("planejarNotas: lança sem rateio, sem data ou valor inválido", () => {
  assert.throws(() => planejarNotas({ emissaoPor: "cobranca", rateios: [] }));
  assert.throws(() => planejarNotas({ emissaoPor: "cobranca", rateios: [{ id: 1, valor_aplicado: 10, data: null }] }));
  assert.throws(() => planejarNotas({ emissaoPor: "cobranca", rateios: [{ id: 1, valor_aplicado: 0, data: "2026-05-13" }] }));
});

test("montarPayloadEmissao: campos e descrição com nome/CRP aparados", () => {
  const payload = montarPayloadEmissao({
    reserva: { ambiente: "homologacao", serie: "1", numero: 5 },
    fiscal: {
      certificado_pfx_cifrado: "pfx",
      certificado_senha_cifrada: "senha",
      documento: "123",
      inscricao_municipal: "9",
      municipio_ibge: "3550308",
      optante_simples_nacional: 3,
      regime_apuracao_sn: 1,
      codigo_tributacao_nacional: "04.03.03",
      codigo_tributacao_municipal: "001",
    },
    plano: { valor: 300, datasISO: ["2026-05-13"], competencia: "2026-05-13" },
    tomador: { documento: "11122233344", nome: "Maria", email: "" },
    nomeProfissional: "  Ana  ",
    crp: " 06/1 ",
  });
  assert.equal(payload.numero, 5);
  assert.equal(payload.competencia, "2026-05-13");
  assert.equal(payload.tomador.email, null);
  assert.equal(payload.valor, 300);
  assert.equal(payload.prestador.documento, "123");
  assert.match(payload.descricao_servico, /\nAna\nCRP: 06\/1$/);
});

test("montarAtualizacaoResultado: autorizada decodifica XML e guarda PDF", () => {
  const b64 = (s) => Buffer.from(s).toString("base64");
  const u = montarAtualizacaoResultado(
    { autorizada: true, dps_id: "D1", chave_acesso: "K", xml_dps_base64: b64("<dps/>"), xml_nfse_base64: b64("<nfse/>"), pdf_base64: "PDF", erros: [] },
    2,
  );
  assert.equal(u.status, "autorizada");
  assert.equal(u.xml_dps, "<dps/>");
  assert.equal(u.xml_nfse, "<nfse/>");
  assert.equal(u.pdf_base64, "PDF");
  assert.equal(u.erros, null);
  assert.equal(u.ultimo_erro, null);
  assert.equal(u.tentativas, 2);
});

test("montarAtualizacaoResultado: rejeitada guarda ultimo_erro e tolera ausência de XML", () => {
  const u = montarAtualizacaoResultado(
    { autorizada: false, dps_id: "D1", erros: [{ codigo: "E1", titulo: "CPF inválido", explicacao: "Revise" }] },
    1,
  );
  assert.equal(u.status, "rejeitada");
  assert.equal(u.xml_dps, null);
  assert.equal(u.ultimo_erro, "CPF inválido: Revise");
  assert.equal(montarAtualizacaoResultado({ autorizada: false }, 1).ultimo_erro, "Nota rejeitada sem detalhe do erro.");
});

test("montarAtualizacaoFalha: marca rejeitada com a mensagem", () => {
  const u = montarAtualizacaoFalha("timeout", 3);
  assert.equal(u.status, "rejeitada");
  assert.equal(u.erros[0].explicacao, "timeout");
  assert.match(u.ultimo_erro, /timeout/);
  assert.equal(u.tentativas, 3);
});

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

test("classificarResultadoEmissao: autorizada e recusa definitiva", () => {
  assert.equal(classificarResultadoEmissao({ resposta: { autorizada: true, erros: [] } }), "autorizada");
  assert.equal(
    classificarResultadoEmissao({ resposta: { autorizada: false, erros: [{ codigo: "E0312", titulo: "Regra" }] } }),
    "rejeitada",
  );
});

test("classificarResultadoEmissao: falha de transporte é incerta (flag e titulo do serviço antigo)", () => {
  assert.equal(
    classificarResultadoEmissao({ resposta: { autorizada: false, falha_transporte: true, erros: [{ codigo: "E1", titulo: "x" }] } }),
    "incerta",
  );
  assert.equal(
    classificarResultadoEmissao({ resposta: { autorizada: false, erros: [{ codigo: "?", titulo: "Falha de comunicacao com a SEFIN" }] } }),
    "incerta",
  );
  assert.equal(classificarResultadoEmissao({ resposta: null }), "incerta");
});

test("classificarResultadoEmissao: recusa sem erros listados é incerta", () => {
  assert.equal(classificarResultadoEmissao({ resposta: { autorizada: false, erros: [] } }), "incerta");
  assert.equal(classificarResultadoEmissao({ resposta: { autorizada: false } }), "incerta");
  assert.equal(
    classificarResultadoEmissao({ resposta: { autorizada: false, erros: [{ codigo: "E0312", titulo: "Regra" }] } }),
    "rejeitada",
  );
});

test("classificarResultadoEmissao: só 400/401/403/404/422 são recusa; demais 4xx são incertos", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status }) }), "rejeitada");
  }
  for (const status of [408, 409, 429, 499]) {
    assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status }) }), "incerta");
  }
});

test("classificarResultadoEmissao: exceção 4xx rejeita, 5xx/rede é incerta, não enviada rejeita", () => {
  assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status: 400 }) }), "rejeitada");
  assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status: 422 }) }), "rejeitada");
  assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status: 500 }) }), "incerta");
  assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("x"), { status: 502 }) }), "incerta");
  assert.equal(classificarResultadoEmissao({ erro: new Error("fetch failed") }), "incerta");
  assert.equal(classificarResultadoEmissao({ erro: Object.assign(new Error("cfg"), { naoEnviada: true }) }), "rejeitada");
});

test("montarAtualizacaoIncerta: mantém pendente e guarda DPS", () => {
  const u = montarAtualizacaoIncerta(
    { resposta: { dps_id: "D9", xml_dps_base64: Buffer.from("<d/>").toString("base64"), erros: [{ titulo: "Falha de comunicacao com a SEFIN", explicacao: "timeout" }] } },
    2,
  );
  assert.equal(u.status, "pendente");
  assert.equal(u.dps_id, "D9");
  assert.equal(u.xml_dps, "<d/>");
  assert.equal(u.tentativas, 2);
  assert.ok(u.ultimo_erro.startsWith(MENSAGEM_INCERTA));
  assert.ok(u.ultimo_erro.includes("timeout"));
  const e = montarAtualizacaoIncerta({ erro: new Error("boom") }, 1);
  assert.equal(e.status, "pendente");
  assert.ok(!("dps_id" in e));
  assert.ok(e.ultimo_erro.includes("boom"));
});

test("validarCompetencias: hoje e passado ok, futuro bloqueia", () => {
  const p = (c) => ({ competencia: c });
  assert.deepEqual(validarCompetencias({ planos: [p("2026-11-12")], hoje: "2026-11-12" }), { ok: true });
  assert.deepEqual(validarCompetencias({ planos: [p("2026-10-01"), p("2026-11-11")], hoje: "2026-11-12" }), { ok: true });
  assert.deepEqual(validarCompetencias({ planos: [p("2026-10-01"), p("2026-11-13")], hoje: "2026-11-12" }), {
    ok: false,
    motivo: MOTIVO_COMPETENCIA_FUTURA,
  });
});

test("responsavelParaTomador: próprio vira paciente; terceiro permanece", () => {
  const proprio = { nome: "Ana", cpf_cnpj: null, paciente_vinculado: 10 };
  const terceiro = { nome: "Mãe", cpf_cnpj: "12345678901", paciente_vinculado: null };
  assert.equal(responsavelParaTomador({ responsavel: proprio, pacienteId: 10 }), null);
  assert.equal(responsavelParaTomador({ responsavel: proprio, pacienteId: "10" }), null);
  assert.equal(responsavelParaTomador({ responsavel: terceiro, pacienteId: 10 }), terceiro);
  assert.equal(responsavelParaTomador({ responsavel: { ...terceiro, paciente_vinculado: 11 }, pacienteId: 10 }).nome, "Mãe");
  assert.equal(responsavelParaTomador({ responsavel: null, pacienteId: 10 }), null);
  const t = escolherTomador({
    responsavel: responsavelParaTomador({ responsavel: proprio, pacienteId: 10 }),
    paciente: { nome: "Ana", cpf: "111.222.333-44" },
  });
  assert.equal(t.origem, "paciente");
  assert.equal(t.documento, "11122233344");
});

test("itensSemNotaAtiva: modo cobrança e modo sessão", () => {
  const plano = [{ recebimentoSessao: 1 }, { recebimentoSessao: 2 }];
  assert.equal(itensSemNotaAtiva({ emissaoPor: "cobranca", plano: [{ recebimentoSessao: null }], ativas: [] }).length, 1);
  assert.equal(itensSemNotaAtiva({ emissaoPor: "cobranca", plano: [{ recebimentoSessao: null }], ativas: [{ status: "pendente" }] }).length, 0);
  assert.deepEqual(
    itensSemNotaAtiva({ emissaoPor: "sessao", plano, ativas: [{ recebimento_sessao: 1, status: "autorizada" }] }).map((p) => p.recebimentoSessao),
    [2],
  );
});

test("tentativasDoItem: rejeitadas anteriores + 1", () => {
  const existentes = [
    { recebimento_sessao: 1, status: "rejeitada" },
    { recebimento_sessao: 1, status: "rejeitada" },
    { recebimento_sessao: 2, status: "rejeitada" },
    { recebimento_sessao: 2, status: "cancelada" },
  ];
  assert.equal(tentativasDoItem({ emissaoPor: "cobranca", recebimentoSessao: null, existentes }), 4);
  assert.equal(tentativasDoItem({ emissaoPor: "sessao", recebimentoSessao: 1, existentes }), 3);
  assert.equal(tentativasDoItem({ emissaoPor: "sessao", recebimentoSessao: 2, existentes }), 2);
  assert.equal(tentativasDoItem({ emissaoPor: "sessao", recebimentoSessao: 3, existentes }), 1);
});

test("montarPayloadEmissao: descrição completa exata com várias datas", () => {
  const payload = montarPayloadEmissao({
    reserva: { ambiente: "homologacao", serie: "1", numero: 1 },
    fiscal: {},
    plano: { valor: 1, datasISO: ["2026-05-20", "2026-05-13", "2026-05-27"], competencia: "2026-05-27" },
    tomador: { documento: "1", nome: "M" },
    nomeProfissional: " Ana Souza ",
    crp: " 06/12345 ",
  });
  assert.equal(
    payload.descricao_servico,
    "Atendimento(s) psicológico(s) em 13/05/2026, 20/05/2026 e 27/05/2026.\n\nServiço prestado por:\nAna Souza\nCRP: 06/12345",
  );
});
