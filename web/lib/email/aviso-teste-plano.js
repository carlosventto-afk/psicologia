// web/lib/email/aviso-teste-plano.js
// E-mail de aviso de fim próximo da liberação temporária (teste) de plano.

const FUSO = "America/Sao_Paulo";

function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarData(expiraEm) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(expiraEm));
}

export function montarEmailAvisoTeste({ nome, planoNome, expiraEm, dias }) {
  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const data = formatarData(expiraEm);
  const quando = dias === 1 ? "amanhã" : `em ${dias} dias`;
  const saudacao = nome ? `Olá, ${escaparHtml(nome)}!` : "Olá!";
  const plano = escaparHtml(planoNome);
  const link = `${origem}/assinatura`;

  const subject = `Seu teste do plano ${planoNome} termina ${quando}`;
  const html = `
<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
  <p>${saudacao}</p>
  <p>Seu período de teste do plano <strong>${plano}</strong> termina em <strong>${data}</strong>.</p>
  <p>Se nenhum plano pago for contratado até lá, sua conta voltará ao plano <strong>Grátis</strong>.</p>
  <p><a href="${escaparHtml(link)}">Contratar um plano</a></p>
  <p>Equipe PsiAgente</p>
</div>`.trim();

  return { subject, html };
}
