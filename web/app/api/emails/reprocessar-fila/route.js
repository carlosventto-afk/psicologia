import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsapp, NUMERO_GESTOR } from "@/lib/whatsapp";

const RESEND_API_URL = "https://api.resend.com/emails";
const REMETENTE = "PsiAgente <no-reply@psiagente.com.br>";

// Minutos de espera antes de cada tentativa (índice = tentativas já
// feitas antes desta). 5 tentativas no total -- na 5ª falha, esgota.
const BACKOFF_MINUTOS = [5, 30, 120, 720, 1440];

async function tentarReenviar(email) {
  try {
    const resposta = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMETENTE,
        to: email.destinatario,
        subject: email.assunto,
        html: email.corpo_html,
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return { sucesso: false, erro: `Resend respondeu ${resposta.status}: ${corpo}` };
    }

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.EMAIL_QUEUE_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: pendentes, error: erroSelect } = await admin
    .from("EmailFalhado")
    .select("id, destinatario, assunto, corpo_html, tentativas")
    .eq("resolvido", false)
    .eq("esgotado", false)
    .lte("proxima_tentativa", agora);

  if (erroSelect) {
    console.error("Falha ao buscar EmailFalhado pendente:", erroSelect.message);
    return Response.json({ reenviados: 0, esgotados: 0 });
  }

  let reenviados = 0;
  let esgotados = 0;

  for (const email of pendentes ?? []) {
    const resultado = await tentarReenviar(email);

    if (resultado.sucesso) {
      await admin.from("EmailFalhado").update({ resolvido: true }).eq("id", email.id);
      reenviados += 1;
      continue;
    }

    const tentativas = email.tentativas + 1;

    if (tentativas >= BACKOFF_MINUTOS.length) {
      await admin
        .from("EmailFalhado")
        .update({ tentativas, esgotado: true, ultimo_erro: resultado.erro })
        .eq("id", email.id);
      esgotados += 1;

      await enviarWhatsapp({
        numero: NUMERO_GESTOR,
        mensagem: `⚠️ Um e-mail não conseguiu ser entregue depois de ${tentativas} tentativas.\nPara: ${email.destinatario}\nAssunto: ${email.assunto}\nErro: ${resultado.erro}`,
      }).catch(() => {});
      continue;
    }

    const proximaTentativa = new Date(Date.now() + BACKOFF_MINUTOS[tentativas - 1] * 60 * 1000).toISOString();
    await admin
      .from("EmailFalhado")
      .update({ tentativas, proxima_tentativa: proximaTentativa, ultimo_erro: resultado.erro })
      .eq("id", email.id);
  }

  return Response.json({ reenviados, esgotados, total: pendentes?.length ?? 0 });
}
