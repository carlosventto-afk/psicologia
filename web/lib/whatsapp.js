// web/lib/whatsapp.js
//
// Envio direto pela Evolution API, pra avisos administrativos que não
// pertencem a uma conversa de lead (fila de e-mail esgotada, resumo
// diário) -- diferente do fluxo normal, que sempre manda mensagem via
// o sub-workflow "WA - Enviar Mensagem" do n8n. Mesmo endpoint/formato
// que aquele workflow já usa.
const EVOLUTION_API_URL = "https://psifacil-evolution-api.lcuzxl.easypanel.host";
const EVOLUTION_INSTANCE = "psifacil";
export const NUMERO_GESTOR = "5591981910295";

export async function enviarWhatsapp({ numero, mensagem }) {
  const resposta = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: {
      apikey: process.env.EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: numero, text: mensagem }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    return { error: new Error(`Evolution API respondeu ${resposta.status}: ${corpo}`) };
  }

  return { error: null };
}
