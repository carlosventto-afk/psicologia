// Regras puras da NFS-e por cobrança (sem acesso a banco nem dependências).

export const MOTIVOS = {
  semDadosFiscais: "Configure seus dados fiscais em Configurações → NFS-e.",
  certificadoAusente: "Envie o certificado digital em Configurações → NFS-e.",
  certificadoVencido: "O certificado digital está vencido. Envie um novo em Configurações → NFS-e.",
  semCrp: "Cadastre seu CRP em Meus Dados.",
  semDocumentoTomador:
    "O tomador da nota (responsável financeiro ou paciente) não tem CPF/CNPJ cadastrado.",
};

const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");

// "YYYY-MM-DD" -> "dd/mm/aaaa" sem passar por Date (evita deslocamento de fuso).
function dataBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function datasUnicasOrdenadas(datasISO) {
  return [...new Set(datasISO)].sort();
}

export function formatarListaDatas(datasISO) {
  const d = datasUnicasOrdenadas(datasISO).map(dataBR);
  if (d.length <= 1) return d.join("");
  return `${d.slice(0, -1).join(", ")} e ${d[d.length - 1]}`;
}

export function montarDescricaoNota({ datasISO, nomeProfissional, crp }) {
  return `Atendimento(s) psicológico(s) em ${formatarListaDatas(datasISO)}.\n\nServiço prestado por:\n${nomeProfissional}\nCRP: ${crp}`;
}

export function competenciaDaNota(datasISO) {
  if (!datasISO || datasISO.length === 0) {
    throw new Error("Lista de datas vazia: não há competência para a nota.");
  }
  return datasUnicasOrdenadas(datasISO).at(-1);
}

export function escolherTomador({ responsavel, paciente }) {
  const usaResp = Boolean(responsavel);
  const origem = usaResp ? "responsavel" : "paciente";
  const parte = usaResp ? responsavel : paciente;
  const documento = apenasDigitos(usaResp ? responsavel.cpf_cnpj : paciente?.cpf);
  if (documento.length !== 11 && documento.length !== 14) {
    return { erro: "sem_documento", origem };
  }
  return {
    nome: parte?.nome,
    documento,
    email: parte?.email ?? null,
    telefone: parte?.telefone ?? null,
    origem,
  };
}

export function validarPreCondicoes({ fiscal, usuario, tomador, hoje }) {
  const falha = (motivo) => ({ ok: false, motivo });
  if (!fiscal) return falha(MOTIVOS.semDadosFiscais);
  if (!fiscal.certificado_pfx_cifrado) return falha(MOTIVOS.certificadoAusente);
  if (fiscal.certificado_validade && fiscal.certificado_validade < hoje) {
    return falha(MOTIVOS.certificadoVencido);
  }
  if (!usuario?.crp || !String(usuario.crp).trim()) return falha(MOTIVOS.semCrp);
  if (tomador?.erro) return falha(MOTIVOS.semDocumentoTomador);
  return { ok: true };
}

export function canaisDeEntrega({
  ambiente,
  tomador,
  optInWhatsapp,
  jaEnviadoEmail,
  jaEnviadoWhatsapp,
}) {
  const producao = ambiente === "producao";
  const email =
    producao && Boolean(tomador?.email && String(tomador.email).trim()) && !jaEnviadoEmail;
  const whatsapp =
    producao &&
    apenasDigitos(tomador?.telefone).length >= 10 &&
    optInWhatsapp === true &&
    !jaEnviadoWhatsapp;
  return { email, whatsapp };
}

// ---------------------------------------------------------------------------
// Planejamento e montagem da emissão (puro; a orquestração fica em nfse-emissao.js)
// ---------------------------------------------------------------------------

const paraCentavos = (v) => Math.round(Number(v ?? 0) * 100) || 0;

// Soma em centavos inteiros (sem erro de ponto flutuante); devolve em reais.
export function somarValores(valores) {
  return (valores ?? []).reduce((soma, v) => soma + paraCentavos(v), 0) / 100;
}

const STATUS_ATIVOS = ["pendente", "autorizada"];

export function notasAtivas(notas) {
  return (notas ?? []).filter((n) => STATUS_ATIVOS.includes(n.status));
}

export function contarRejeitadas(notas) {
  return (notas ?? []).filter((n) => n.status === "rejeitada").length;
}

// rateios: [{ id, valor_aplicado, data }] (uma linha de RecebimentoSessao com a
// data da sessão). Devolve as notas a emitir: uma só (modo cobrança) ou uma por
// rateio (modo sessão). Lança se faltar rateio, data ou valor positivo.
export function planejarNotas({ emissaoPor, rateios }) {
  if (!rateios || rateios.length === 0) {
    throw new Error("Recebimento sem sessões aplicadas: não há o que faturar.");
  }
  for (const r of rateios) {
    if (!r.data || !/^\d{4}-\d{2}-\d{2}/.test(r.data)) {
      throw new Error("Sessão sem data válida: não é possível montar a nota.");
    }
    if (!(paraCentavos(r.valor_aplicado) > 0)) {
      throw new Error("Valor aplicado inválido: não é possível montar a nota.");
    }
  }
  const data = (r) => String(r.data).slice(0, 10);
  if (emissaoPor === "sessao") {
    return rateios.map((r) => ({
      recebimentoSessao: r.id,
      valor: paraCentavos(r.valor_aplicado) / 100,
      datasISO: [data(r)],
      competencia: competenciaDaNota([data(r)]),
    }));
  }
  const datasISO = rateios.map(data);
  return [
    {
      recebimentoSessao: null,
      valor: somarValores(rateios.map((r) => r.valor_aplicado)),
      datasISO,
      competencia: competenciaDaNota(datasISO),
    },
  ];
}

export function montarPayloadEmissao({ reserva, fiscal, plano, tomador, nomeProfissional, crp }) {
  return {
    ambiente: reserva.ambiente,
    certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
    certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
    serie: reserva.serie,
    numero: reserva.numero,
    competencia: plano.competencia,
    prestador: {
      documento: fiscal.documento,
      inscricao_municipal: fiscal.inscricao_municipal,
      municipio_ibge: fiscal.municipio_ibge,
      optante_simples_nacional: fiscal.optante_simples_nacional,
      regime_apuracao_sn: fiscal.regime_apuracao_sn,
      codigo_tributacao_nacional: fiscal.codigo_tributacao_nacional,
      codigo_tributacao_municipal: fiscal.codigo_tributacao_municipal,
    },
    tomador: {
      documento: tomador.documento,
      nome: tomador.nome,
      email: tomador.email || null,
    },
    descricao_servico: montarDescricaoNota({
      datasISO: plano.datasISO,
      nomeProfissional: String(nomeProfissional ?? "").trim(),
      crp: String(crp ?? "").trim(),
    }),
    valor: plano.valor,
  };
}

const decodificar = (b64) => (b64 ? Buffer.from(b64, "base64").toString("utf-8") : null);

// Colunas de NotaFiscal a gravar após a resposta do serviço (mesmo formato de
// emitirNotaFiscal, mais pdf_base64, ultimo_erro e tentativas).
export function montarAtualizacaoResultado(resultado, tentativas) {
  const autorizada = resultado?.autorizada === true;
  const erros = resultado?.erros?.length ? resultado.erros : null;
  const primeiro = erros?.[0];
  return {
    dps_id: resultado?.dps_id ?? null,
    xml_dps: decodificar(resultado?.xml_dps_base64),
    status: autorizada ? "autorizada" : "rejeitada",
    chave_acesso: resultado?.chave_acesso ?? null,
    xml_nfse: decodificar(resultado?.xml_nfse_base64),
    pdf_base64: resultado?.pdf_base64 ?? null,
    erros,
    ultimo_erro: autorizada
      ? null
      : primeiro
        ? [primeiro.titulo, primeiro.explicacao].filter(Boolean).join(": ")
        : "Nota rejeitada sem detalhe do erro.",
    tentativas,
  };
}

// ---------------------------------------------------------------------------
// Resultado incerto (SEFIN pode ter autorizado): a nota NUNCA vira rejeitada
// nem recebe número novo; fica pendente até confirmação manual.
// ---------------------------------------------------------------------------

export const TITULO_FALHA_SEFIN = "Falha de comunicacao com a SEFIN";

export const MENSAGEM_INCERTA =
  "Aguardando confirmação da prefeitura; não emita de novo — verifique no portal da NFS-e.";

export const MOTIVO_COMPETENCIA_FUTURA =
  "Há sessões com data futura na cobrança; aguarde a data para emitir a nota.";

// Entrada: { resposta } (o serviço respondeu 200) ou { erro } (a chamada lançou).
// 'autorizada' | 'rejeitada' (recusa definitiva) | 'incerta'.
export function classificarResultadoEmissao({ resposta, erro } = {}) {
  if (erro) {
    if (erro.naoEnviada === true) return "rejeitada";
    const st = Number(erro.status);
    return Number.isInteger(st) && st >= 400 && st <= 499 ? "rejeitada" : "incerta";
  }
  if (!resposta || typeof resposta !== "object") return "incerta";
  if (resposta.autorizada === true) return "autorizada";
  if (resposta.falha_transporte === true) return "incerta";
  if (resposta.erros?.[0]?.titulo === TITULO_FALHA_SEFIN) return "incerta";
  return "rejeitada";
}

// Mantém a nota pendente guardando o que houver da resposta.
export function montarAtualizacaoIncerta({ resposta, erro }, tentativas) {
  const detalhe =
    resposta?.erros?.[0]?.explicacao ||
    resposta?.erros?.[0]?.titulo ||
    erro?.message ||
    (erro ? String(erro) : "resposta inválida do serviço");
  const colunas = {
    status: "pendente",
    ultimo_erro: `${MENSAGEM_INCERTA} (${detalhe})`,
    tentativas,
  };
  if (resposta?.dps_id) colunas.dps_id = resposta.dps_id;
  if (resposta?.xml_dps_base64) colunas.xml_dps = decodificar(resposta.xml_dps_base64);
  return colunas;
}

// Toda nota planejada precisa ter competência <= hoje (ambos "YYYY-MM-DD").
export function validarCompetencias({ planos, hoje }) {
  const futura = (planos ?? []).some((p) => p.competencia > hoje);
  return futura ? { ok: false, motivo: MOTIVO_COMPETENCIA_FUTURA } : { ok: true };
}

// ResponsavelFinanceiro "próprio" (aponta para o próprio paciente) não tem
// cpf_cnpj: o paciente é o tomador (mesma regra de carne-leao.js).
export function responsavelParaTomador({ responsavel, pacienteId }) {
  if (!responsavel) return null;
  if (
    responsavel.paciente_vinculado != null &&
    Number(responsavel.paciente_vinculado) === Number(pacienteId)
  ) {
    return null;
  }
  return responsavel;
}

// Itens do plano que ainda precisam de nota (sem nota ativa).
export function itensSemNotaAtiva({ emissaoPor, plano, ativas }) {
  if (emissaoPor === "sessao") {
    return plano.filter((p) => !ativas.some((n) => n.recebimento_sessao === p.recebimentoSessao));
  }
  return ativas.length === 0 ? plano : [];
}

// tentativas = rejeitadas anteriores do mesmo item + 1.
export function tentativasDoItem({ emissaoPor, recebimentoSessao, existentes }) {
  const doItem = (existentes ?? []).filter((n) =>
    emissaoPor === "sessao" ? n.recebimento_sessao === recebimentoSessao : true,
  );
  return contarRejeitadas(doItem) + 1;
}

// Falha ao chamar o serviço (exceção): a nota reservada fica rejeitada.
export function montarAtualizacaoFalha(mensagem, tentativas) {
  return {
    status: "rejeitada",
    erros: [
      {
        codigo: "?",
        titulo: "Falha ao chamar o serviço de emissão",
        explicacao: mensagem,
        acao_sugerida: "Tente novamente em instantes.",
      },
    ],
    ultimo_erro: "Falha ao chamar o serviço de emissão: " + mensagem,
    tentativas,
  };
}
