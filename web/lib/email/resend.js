// web/lib/email/resend.js
//
// Envio de e-mail direto pela API do Resend, sem passar pelo relay SMTP
// interno do Supabase Auth -- o Supabase apresentou instabilidade
// persistente nesse relay (signInWithOtp retornando 500 mesmo com
// credenciais/config confirmadas corretas, 2026-09-04 a 2026-09-08, ver
// docs/status-implementacao.md), enquanto o mesmo RESEND_API_KEY chamado
// direto contra a API do Resend sempre funcionou.
const RESEND_API_URL = "https://api.resend.com/emails";
const REMETENTE = "PsiAgente <no-reply@psiagente.com.br>";

export async function enviarEmailResend({ to, subject, html }) {
  const resposta = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: REMETENTE, to, subject, html }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    return { error: new Error(`Resend respondeu ${resposta.status}: ${corpo}`) };
  }

  return { error: null };
}
