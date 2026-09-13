// web/lib/email/resend.js
//
// Envio de e-mail direto pela API do Resend, sem passar pelo relay SMTP
// interno do Supabase Auth -- o Supabase apresentou instabilidade
// persistente nesse relay (signInWithOtp retornando 500 mesmo com
// credenciais/config confirmadas corretas, 2026-09-04 a 2026-09-08, ver
// docs/status-implementacao.md), enquanto o mesmo RESEND_API_KEY chamado
// direto contra a API do Resend sempre funcionou.
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_API_URL = "https://api.resend.com/emails";
const REMETENTE = "PsiAgente <no-reply@psiagente.com.br>";
export const EMAIL_ADMIN = "carlosventto@gmail.com";

// Melhor esforço: se enfileirar também falhar, o e-mail original já
// falhou mesmo -- não tem como piorar, só perde o fallback dessa vez.
async function enfileirarEmailFalhado({ to, subject, html, erro }) {
  try {
    await createAdminClient().from("EmailFalhado").insert({
      destinatario: to,
      assunto: subject,
      corpo_html: html,
      ultimo_erro: erro,
    });
  } catch {
    // Silencioso de propósito -- ver comentário acima.
  }
}

export async function enviarEmailResend({ to, subject, html }) {
  let resposta;
  try {
    resposta = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: REMETENTE, to, subject, html }),
    });
  } catch (erroRede) {
    await enfileirarEmailFalhado({ to, subject, html, erro: erroRede.message });
    return { error: erroRede };
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    const erro = new Error(`Resend respondeu ${resposta.status}: ${corpo}`);
    await enfileirarEmailFalhado({ to, subject, html, erro: erro.message });
    return { error: erro };
  }

  return { error: null };
}
