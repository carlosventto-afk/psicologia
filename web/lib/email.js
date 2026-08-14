// Primeira integracao de e-mail direta neste app (o item 9 usa um n8n
// externo, que nem esta implantado -- ver correcao na spec deste item).
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !remetente) {
    throw new Error("Resend nao configurado (RESEND_API_KEY/RESEND_FROM_EMAIL ausentes).");
  }

  const resposta = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: remetente, to, subject, html, attachments }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao enviar e-mail via Resend (${resposta.status}): ${corpo}`);
  }

  return resposta.json();
}

export async function enviarEmailNotaFiscal({ paraEmail, pacienteNome, xmlBase64, pdfBase64 }) {
  const anexos = [{ filename: "nota-fiscal.xml", content: xmlBase64 }];
  if (pdfBase64) {
    anexos.push({ filename: "nota-fiscal.pdf", content: pdfBase64 });
  }

  return sendEmail({
    to: paraEmail,
    subject: "Sua Nota Fiscal de Servico (NFS-e)",
    html: `<p>Ola, ${pacienteNome}.</p><p>Segue em anexo a Nota Fiscal de Servico referente ao seu atendimento.</p>`,
    attachments: anexos,
  });
}
