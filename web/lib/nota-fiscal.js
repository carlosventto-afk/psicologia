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

// De onde vem a competência (dCompet) da nota: a data do último atendimento (padrão) ou a data
// do pagamento informada ao receber a cobrança. Configuração em DadosFiscaisProfissional.
export const ORIGENS_COMPETENCIA = ["atendimentos", "pagamento"];

// Valor ausente ou desconhecido cai no padrão: nenhuma nota muda de competência sem opção expressa.
export function origemDaCompetencia(fiscal) {
  return fiscal?.competencia_origem === "pagamento" ? "pagamento" : "atendimentos";
}

export function validarOrigemCompetencia(valor) {
  if (ORIGENS_COMPETENCIA.includes(valor)) return { ok: true, origem: valor };
  return { ok: false, motivo: "Escolha de onde vem a competência da nota: data dos atendimentos ou data do pagamento." };
}

// "YYYY-MM-DD..." -> "YYYY-MM-DD". Lança se não houver data de pagamento válida.
export function competenciaPeloPagamento(dataPagamento) {
  if (!dataPagamento || !/^\d{4}-\d{2}-\d{2}/.test(String(dataPagamento))) {
    throw new Error("Recebimento sem data de pagamento válida: não é possível definir a competência da nota.");
  }
  return String(dataPagamento).slice(0, 10);
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
    normalizarTelefoneWhatsapp(tomador?.telefone) !== null &&
    optInWhatsapp === true &&
    !jaEnviadoWhatsapp;
  return { email, whatsapp };
}

// Escape de HTML para texto controlado pelo usuário em corpo de e-mail.
export function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Legenda/mensagem do WhatsApp: abre identificando a psicóloga.
export function montarMensagemWhatsappNota({ nomeProfissional, chave }) {
  return `Nota fiscal do atendimento com ${nomeProfissional}. Chave de acesso: ${chave}.`;
}

// Número no formato da Evolution API: só dígitos com DDI. 10/11 dígitos ganham 55;
// 12/13 dígitos já com DDI ficam como estão; qualquer outro tamanho vira null.
export function normalizarTelefoneWhatsapp(telefone) {
  const digitos = apenasDigitos(telefone);
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length === 12 || digitos.length === 13) return digitos;
  return null;
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
// competenciaOrigem 'pagamento': a competência de cada nota é dataPagamento (data do
// recebimento da cobrança) em vez da data dos atendimentos; datasISO continua com os
// atendimentos, que é o que a descrição da nota lista.
export function planejarNotas({ emissaoPor, rateios, competenciaOrigem = "atendimentos", dataPagamento = null }) {
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
  const pelaDataDoPagamento = competenciaOrigem === "pagamento" ? competenciaPeloPagamento(dataPagamento) : null;
  if (emissaoPor === "sessao") {
    return rateios.map((r) => ({
      recebimentoSessao: r.id,
      valor: paraCentavos(r.valor_aplicado) / 100,
      datasISO: [data(r)],
      competencia: pelaDataDoPagamento ?? competenciaDaNota([data(r)]),
    }));
  }
  const datasISO = rateios.map(data);
  return [
    {
      recebimentoSessao: null,
      valor: somarValores(rateios.map((r) => r.valor_aplicado)),
      datasISO,
      competencia: pelaDataDoPagamento ?? competenciaDaNota(datasISO),
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

export const MOTIVO_COMPETENCIA_FUTURA_PAGAMENTO =
  "A data do pagamento é futura e está configurada como competência da nota; aguarde essa data para emitir a nota.";

const STATUS_RECUSA_DEFINITIVA = [400, 401, 403, 404, 422];

// Entrada: { resposta } (o serviço respondeu 200) ou { erro } (a chamada lançou).
// 'autorizada' | 'rejeitada' (recusa definitiva) | 'incerta'.
export function classificarResultadoEmissao({ resposta, erro } = {}) {
  if (erro) {
    if (erro.naoEnviada === true) return "rejeitada";
    // Só estes 4xx do nosso próprio serviço são recusa definitiva; 408/429/499 e
    // códigos de proxy são incertos.
    return STATUS_RECUSA_DEFINITIVA.includes(Number(erro.status)) ? "rejeitada" : "incerta";
  }
  if (!resposta || typeof resposta !== "object") return "incerta";
  if (resposta.autorizada === true) return "autorizada";
  if (resposta.falha_transporte === true) return "incerta";
  if (resposta.erros?.[0]?.titulo === TITULO_FALHA_SEFIN) return "incerta";
  // Recusa sem nenhum erro listado pode ser resposta não reconhecida: não é definitiva.
  if (!resposta.erros?.length) return "incerta";
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

// ---------------------------------------------------------------------------
// "Verificar na SEFIN": resolve uma nota pendente de resultado incerto
// consultando a DPS no governo (resposta de /consultar-dps do nfse-service).
// ---------------------------------------------------------------------------

export const MENSAGEM_VERIFICADA_NAO_EMITIDA = "Verificado na SEFIN: a nota não foi emitida.";

// Notas pendentes recém-criadas (sem erro registrado) podem estar no meio de uma
// emissão em andamento: só vira verificável depois desta janela.
export const JANELA_EMISSAO_EM_ANDAMENTO_MS = 10 * 60 * 1000;

// Pendente com resultado incerto (ultimo_erro gravado) ou parada há mais que a janela.
export function notaVerificavelNaSefin(nota, agora = Date.now()) {
  if (!nota || nota.status !== "pendente") return false;
  if (String(nota.ultimo_erro ?? "").trim()) return true;
  const criada = Date.parse(nota.created_at ?? "");
  return Number.isFinite(criada) && agora - criada > JANELA_EMISSAO_EM_ANDAMENTO_MS;
}

// Decide a transição a partir da resposta da consulta. Só a SEFIN afirmando que
// a DPS existe ('encontrada' com chave) autoriza; só 'nao_encontrada' explícito
// libera nova emissão. Qualquer outra coisa mantém a nota como está.
// -> 'autorizar' | 'liberar' | 'manter'
export function decidirVerificacaoSefin(resposta) {
  if (!resposta || typeof resposta !== "object") return "manter";
  if (resposta.situacao === "encontrada" && String(resposta.chave_acesso ?? "").trim()) return "autorizar";
  if (resposta.situacao === "nao_encontrada") return "liberar";
  return "manter";
}

export function montarAtualizacaoVerificadaAutorizada(resposta) {
  return {
    status: "autorizada",
    dps_id: resposta?.dps_id ?? null,
    chave_acesso: resposta.chave_acesso,
    xml_nfse: decodificar(resposta?.xml_nfse_base64),
    pdf_base64: resposta?.pdf_base64 ?? null,
    erros: null,
    ultimo_erro: null,
  };
}

export function montarAtualizacaoVerificadaNaoEmitida(resposta) {
  return {
    status: "rejeitada",
    ...(resposta?.dps_id ? { dps_id: resposta.dps_id } : {}),
    ultimo_erro: MENSAGEM_VERIFICADA_NAO_EMITIDA,
  };
}

// Toda nota planejada precisa ter competência <= hoje (ambos "YYYY-MM-DD"). A origem 'pagamento'
// só muda a mensagem: a competência futura passa a ser a data do pagamento, não uma sessão.
export function validarCompetencias({ planos, hoje, origem = "atendimentos" }) {
  const futura = (planos ?? []).some((p) => p.competencia > hoje);
  if (!futura) return { ok: true };
  return { ok: false, motivo: origem === "pagamento" ? MOTIVO_COMPETENCIA_FUTURA_PAGAMENTO : MOTIVO_COMPETENCIA_FUTURA };
}

// ResponsavelFinanceiro "próprio" (aponta para o próprio paciente) não tem
// cpf_cnpj: o paciente é o tomador (mesma regra de carne-leao.js).
export function responsavelParaTomador({ responsavel, pacienteId, pacienteVinculado }) {
  if (!responsavel) return null;
  if (
    responsavel.paciente_vinculado != null &&
    Number(responsavel.paciente_vinculado) === Number(pacienteId)
  ) {
    return null;
  }
  // Responsavel que tambem e paciente (de outro paciente): o que faltar no cadastro
  // do responsavel (CPF, e-mail, telefone) vem do cadastro do paciente vinculado.
  if (responsavel.paciente_vinculado != null && pacienteVinculado) {
    const vazio = (v) => v == null || String(v).trim() === "";
    return {
      ...responsavel,
      nome: vazio(responsavel.nome) ? pacienteVinculado.nome : responsavel.nome,
      cpf_cnpj: vazio(responsavel.cpf_cnpj) ? pacienteVinculado.cpf : responsavel.cpf_cnpj,
      email: vazio(responsavel.email) ? pacienteVinculado.email : responsavel.email,
      telefone: vazio(responsavel.telefone) ? pacienteVinculado.telefone : responsavel.telefone,
    };
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

// ---------------------------------------------------------------------------
// Botão manual e selo "Documentada" (detalhe da cobrança e aba Sessões)
// ---------------------------------------------------------------------------

// Rótulo do botão manual: "Emitir nota", "Tentar de novo" ou null (sem botão).
// Só para cobrança recebida do tipo nota_fiscal. Qualquer nota pendente (resultado
// possivelmente incerto) esconde o botão. Regra por item (chave = recebimento_sessao
// ?? cobranca): "Tentar de novo" se há rejeitada cujo item não tem autorizada;
// "Emitir nota" quando não há notas (ou só canceladas).
export function rotuloBotaoNota({ situacao, tipoDocumento, notas }) {
  if (situacao !== "recebida" || tipoDocumento !== "nota_fiscal") return null;
  const lista = notas ?? [];
  if (lista.some((n) => n.status === "pendente")) return null;
  const chave = (n) => n.recebimento_sessao ?? n.cobranca;
  const autorizadas = new Set(lista.filter((n) => n.status === "autorizada").map(chave));
  if (lista.some((n) => n.status === "rejeitada" && !autorizadas.has(chave(n)))) return "Tentar de novo";
  if (lista.some((n) => n.status === "autorizada")) return null;
  return "Emitir nota";
}

// Data e hora no fuso de São Paulo (timestamptz do banco vem em UTC).
export function formatarDataHoraSaoPaulo(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Uma sessão está documentada quando uma nota autorizada a cobre:
// - nota da cobrança: vínculo ativo cuja Cobranca tem recebimento definido e a
//   sessão tem RecebimentoSessao desse mesmo recebimento; ou
// - nota por sessão numa das RecebimentoSessao da sessão.
// vinculos: [{ ativa, Cobranca: { recebimento, NotaFiscal: [{ status }] } }]
// rateios: [{ recebimento, NotaFiscal: [{ status }] }]
export function sessaoDocumentada({ vinculos, rateios }) {
  const autorizada = (notas) => (notas ?? []).some((n) => n.status === "autorizada");
  const lista = rateios ?? [];
  if (lista.some((r) => autorizada(r.NotaFiscal))) return true;
  return (vinculos ?? []).some((v) => {
    const c = v.Cobranca;
    if (!v.ativa || !c || c.recebimento == null) return false;
    return lista.some((r) => String(r.recebimento) === String(c.recebimento)) && autorizada(c.NotaFiscal);
  });
}

// ---------------------------------------------------------------------------
// Flags na interface: emissao_por e emissao automatica
// ---------------------------------------------------------------------------

// Valor de emissao_por a enviar ao RPC criar_cobranca. So nota_fiscal usa o campo;
// vazio => null (o SQL deriva de Paciente.nota_por_sessao). Invalido => { error }.
export function resolverEmissaoPor(tipoDocumento, valor) {
  if (tipoDocumento !== "nota_fiscal") return { valor: null };
  if (valor === null || valor === undefined || valor === "") return { valor: null };
  if (valor === "cobranca" || valor === "sessao") return { valor };
  return { error: "Forma de emissão da nota inválida." };
}

export const MOTIVO_CRP_EMISSAO_AUTOMATICA = "Cadastre seu CRP em Meus Dados para ativar a emissão automática.";

// Pode ligar a emissão automática? Desligar nunca passa por aqui.
export function validarAtivacaoEmissaoAutomatica({ fiscal, usuario, hoje }) {
  const falha = (motivo) => ({ ok: false, motivo });
  if (!fiscal) return falha(MOTIVOS.semDadosFiscais);
  if (!fiscal.certificado_pfx_cifrado) return falha(MOTIVOS.certificadoAusente);
  if (fiscal.certificado_validade && fiscal.certificado_validade < hoje) {
    return falha(MOTIVO_CERTIFICADO_VENCIDO_ATIVACAO);
  }
  if (!usuario?.crp || !String(usuario.crp).trim()) return falha(MOTIVO_CRP_EMISSAO_AUTOMATICA);
  return { ok: true };
}

// O que gravar em Cobranca.nota_pendencia depois de uma tentativa de emissão:
// null (limpa) se alguma nota existe; o texto da pendência se não há nota;
// undefined (não mexe) se não há nem nota nem pendência.
export function pendenciaParaGravar({ notas, pendencia } = {}) {
  if ((notas ?? []).length > 0) return null;
  const texto = String(pendencia ?? "").trim();
  return texto ? texto : undefined;
}

// Ativar a emissão automática também exige certificado não vencido
// (`validade` "YYYY-MM-DD", `hoje` "YYYY-MM-DD" em America/Sao_Paulo).
export const MOTIVO_CERTIFICADO_VENCIDO_ATIVACAO =
  "Certificado digital vencido. Envie um novo antes de ativar a emissão automática.";

// Ids de Recebimento cuja cobrança emite a nota sozinha por cobrança
// (tipo nota_fiscal e emissao_por 'cobranca'): seus rateios não são emitidos um a um.
export function recebimentosComEmissaoPorCobranca(cobrancas) {
  return new Set(
    (cobrancas ?? [])
      .filter((c) => c.tipo_documento === "nota_fiscal" && c.emissao_por === "cobranca" && c.recebimento != null)
      .map((c) => Number(c.recebimento)),
  );
}
