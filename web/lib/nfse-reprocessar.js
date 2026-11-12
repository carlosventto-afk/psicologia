// Lógica pura do reprocessamento de NFS-e (entregas e alertas).
//
// O job NUNCA reemite notas: falha transitória deixa a nota "pendente"
// (resultado incerto) e "rejeitada" é recusa definitiva; reemitir sem mudança
// só queimaria numeração. Aqui só se decide o que reentregar e o que alertar.

import { escaparHtml } from "./nota-fiscal.js";

export const LIMITE_TENTATIVAS_ENTREGA = 3;
export const LIMITE_POR_CATEGORIA = 25;
export const HORAS_PENDENTE_INCERTA = 2;

const HORA_MS = 60 * 60 * 1000;

// Instante-limite (ISO): pendentes criadas até aqui são consideradas "velhas".
export function limitePendenteIncerta(agora = new Date()) {
  return new Date(agora.getTime() - HORAS_PENDENTE_INCERTA * HORA_MS).toISOString();
}

// Candidata a nova tentativa de entrega. A decisão fina de canais (opt-in,
// ambiente, já enviado) é de entregarNota; aqui só o filtro amplo.
export function deveTentarEntrega(nota) {
  if (!nota || nota.status !== "autorizada") return false;
  if (nota.ambiente !== "producao") return false;
  if ((nota.tentativas_entrega ?? 0) >= LIMITE_TENTATIVAS_ENTREGA) return false;
  const emailPendente = !nota.enviada_email_em && Boolean(nota.tomador_email);
  const whatsappPendente = !nota.enviada_whatsapp_em && Boolean(nota.tomador_telefone);
  return emailPendente || whatsappPendente;
}

export function deveAlertarPendenteIncerta(nota, agora = new Date()) {
  if (!nota || nota.status !== "pendente" || nota.alertada_em) return false;
  const criada = new Date(nota.created_at).getTime();
  if (Number.isNaN(criada)) return false;
  return agora.getTime() - criada >= HORAS_PENDENTE_INCERTA * HORA_MS;
}

// Só rejeitada com motivo registrado (fluxo automático grava ultimo_erro).
export function deveAlertarRejeitada(nota) {
  if (!nota || nota.status !== "rejeitada" || nota.alertada_em) return false;
  return String(nota.ultimo_erro ?? "").trim() !== "";
}

// Esgotou: esta foi a última tentativa permitida e algum canal falhou.
// resultado = retorno de entregarNota ({ email, whatsapp }).
export function entregaEsgotada(novaContagem, resultado) {
  if (novaContagem < LIMITE_TENTATIVAS_ENTREGA) return false;
  return resultado?.email === "falhou" || resultado?.whatsapp === "falhou";
}

// Decide o que fazer depois de entregarNota.
// - Tentou algum canal (enviado/falhou): conta 1 tentativa; esgotada se chegou
//   ao limite e algum canal ainda está "falhou".
// - Pulou os dois canais (nada permitido/pendente): encerra em silêncio
//   (contagem no limite, sem alerta, fora de "esgotadas").
// Borda rara: se o claim foi perdido para um envio concorrente que depois
// falha, o resultado aqui é "pulado" e a nota é encerrada sem nova tentativa.
export function decidirPosEntrega(contagemAtual, resultado) {
  const estados = [resultado?.email, resultado?.whatsapp];
  const tentou = estados.some((e) => e === "enviado" || e === "falhou");
  if (!tentou) {
    return { tentou: false, novaContagem: LIMITE_TENTATIVAS_ENTREGA, encerradaEmSilencio: true, esgotada: false };
  }
  const novaContagem = (contagemAtual ?? 0) + 1;
  return {
    tentou: true,
    novaContagem,
    encerradaEmSilencio: false,
    esgotada: entregaEsgotada(novaContagem, resultado),
  };
}

export const ASSUNTOS = {
  incerta: "NFS-e com resultado incerto — confirme no portal antes de emitir de novo",
  rejeitada: "NFS-e rejeitada — corrija e emita manualmente",
  entrega: "NFS-e emitida, mas não foi entregue ao paciente",
};

// tipo: "incerta" | "rejeitada" | "entrega"
export function montarEmailAlerta({ tipo, nota, nomeProfissional }) {
  const subject = ASSUNTOS[tipo];
  if (!subject) throw new Error(`Tipo de alerta desconhecido: ${tipo}`);
  const saudacao = nomeProfissional ? `Olá, ${escaparHtml(nomeProfissional)}!` : "Olá!";
  const tomador = escaparHtml(nota?.tomador_nome || "paciente");
  const motivo = escaparHtml(nota?.ultimo_erro ?? "");

  let corpo;
  if (tipo === "incerta") {
    corpo =
      `<p>A NFS-e de <strong>${tomador}</strong> foi enviada à prefeitura há mais de ${HORAS_PENDENTE_INCERTA} horas ` +
      `e o resultado é incerto (não sabemos se foi autorizada).</p>` +
      `<p>Resultado incerto: confirme no portal da NFS-e antes de emitir de novo, para não duplicar a nota.</p>`;
  } else if (tipo === "rejeitada") {
    corpo =
      `<p>A NFS-e de <strong>${tomador}</strong> foi rejeitada.</p>` +
      `<p>Motivo: ${motivo}</p>` +
      `<p>Corrija o que for necessário e emita a nota manualmente no PsiAgente.</p>`;
  } else {
    corpo =
      `<p>A NFS-e de <strong>${tomador}</strong> foi emitida, mas não conseguimos entregá-la ao paciente ` +
      `após ${LIMITE_TENTATIVAS_ENTREGA} tentativas.</p>` +
      (motivo ? `<p>Último erro: ${motivo}</p>` : "") +
      `<p>Envie a nota manualmente ao paciente pelo PsiAgente.</p>`;
  }

  return { subject, html: `<p>${saudacao}</p>${corpo}` };
}
