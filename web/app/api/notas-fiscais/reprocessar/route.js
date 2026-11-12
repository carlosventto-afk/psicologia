import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailResend } from "@/lib/email/resend";
import { entregarNota } from "@/lib/nfse-entrega";
import {
  LIMITE_POR_CATEGORIA,
  LIMITE_TENTATIVAS_ENTREGA,
  limitePendenteIncerta,
  deveTentarEntrega,
  deveAlertarPendenteIncerta,
  deveAlertarRejeitada,
  decidirPosEntrega,
  montarEmailAlerta,
} from "@/lib/nfse-reprocessar";

// Job horário (n8n). NUNCA reemite notas: só reentrega NFS-e autorizadas e
// alerta o profissional por e-mail (uma vez por nota, ver alertada_em).

const COLUNAS_ALERTA = "id, owner, status, tomador_nome, ultimo_erro, created_at, alertada_em";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.NFSE_REPROCESS_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date();
  const resumo = { entregues: 0, alertas: 0, esgotadas: 0 };
  const profissionais = new Map();

  async function buscarProfissional(owner) {
    if (!profissionais.has(owner)) {
      const { data, error } = await admin.from("Usuarios").select("nome, email").eq("id_user", owner).maybeSingle();
      if (error) throw new Error(error.message);
      profissionais.set(owner, data ?? null);
    }
    return profissionais.get(owner);
  }

  // Envia o alerta e marca alertada_em após qualquer tentativa. Devolve true se tentou.
  async function alertar(nota, tipo) {
    const profissional = await buscarProfissional(nota.owner);
    if (!profissional?.email) {
      // Sem e-mail não há o que enviar: grava alertada_em mesmo assim para a nota
      // não ser selecionada de novo a cada hora e ocupar o lote.
      console.error(`[nfse-reprocessar] profissional sem e-mail; alerta não enviado (nota ${nota.id})`);
      const { error } = await admin
        .from("NotaFiscal")
        .update({ alertada_em: new Date().toISOString() })
        .eq("id", nota.id)
        .is("alertada_em", null);
      if (error) console.error(`[nfse-reprocessar] alertada_em não gravado (nota ${nota.id}): ${error.message}`);
      return false;
    }
    const { subject, html } = montarEmailAlerta({ tipo, nota, nomeProfissional: profissional.nome });
    let envio;
    try {
      envio = await enviarEmailResend({ to: profissional.email, subject, html });
    } catch (erro) {
      envio = { error: erro };
    }
    // enviarEmailResend enfileira a falha em EmailFalhado (a fila é dona dos
    // reenvios). Por isso alertada_em é gravado após QUALQUER tentativa:
    // senão o job reenviaria a cada hora além da cópia da fila.
    if (envio?.error) console.error(`[nfse-reprocessar] e-mail de alerta falhou (nota ${nota.id}); fila assume`);
    const { error } = await admin
      .from("NotaFiscal")
      .update({ alertada_em: new Date().toISOString() })
      .eq("id", nota.id)
      .is("alertada_em", null);
    if (error) console.error(`[nfse-reprocessar] alertada_em não gravado (nota ${nota.id}): ${error.message}`);
    return true;
  }

  // (a) Reentrega de notas autorizadas
  try {
    const { data: candidatas, error } = await admin
      .from("NotaFiscal")
      .select(
        "id, owner, status, ambiente, tomador_nome, ultimo_erro, created_at, alertada_em, tentativas_entrega, enviada_email_em, enviada_whatsapp_em, tomador_email, tomador_telefone",
      )
      .eq("status", "autorizada")
      .eq("ambiente", "producao")
      .lt("tentativas_entrega", LIMITE_TENTATIVAS_ENTREGA)
      // Só notas com canal pendente E com dado do tomador para esse canal.
      .or("and(enviada_email_em.is.null,tomador_email.not.is.null),and(enviada_whatsapp_em.is.null,tomador_telefone.not.is.null)")
      .order("created_at", { ascending: true })
      .limit(LIMITE_POR_CATEGORIA);
    if (error) throw new Error(error.message);

    for (const nota of (candidatas ?? []).filter(deveTentarEntrega)) {
      try {
        const resultado = await entregarNota(admin, nota.id);
        const decisao = decidirPosEntrega(nota.tentativas_entrega, resultado);
        if (resultado.email === "enviado" || resultado.whatsapp === "enviado") resumo.entregues++;

        // Otimista: só conta se ninguém mexeu na contagem entre o select e agora.
        await admin
          .from("NotaFiscal")
          .update({ tentativas_entrega: decisao.novaContagem })
          .eq("id", nota.id)
          .eq("tentativas_entrega", nota.tentativas_entrega ?? 0);

        if (decisao.esgotada) {
          resumo.esgotadas++;
          // Relê a nota: ultimo_erro fresco (gravado por entregarNota) e alertada_em.
          const { data: fresca } = await admin.from("NotaFiscal").select(COLUNAS_ALERTA).eq("id", nota.id).maybeSingle();
          if (fresca && !fresca.alertada_em) {
            if (await alertar(fresca, "entrega")) resumo.alertas++;
          }
        }
      } catch (erro) {
        console.error(`[nfse-reprocessar] erro na entrega (nota ${nota.id}): ${erro?.message ?? erro}`);
      }
    }
  } catch (erro) {
    console.error(`[nfse-reprocessar] falha ao buscar notas para entrega: ${erro?.message ?? erro}`);
  }

  // (b) Alertas: pendentes antigas (resultado incerto) e rejeitadas com motivo
  const categorias = [
    {
      tipo: "incerta",
      consulta: () =>
        admin
          .from("NotaFiscal")
          .select(COLUNAS_ALERTA)
          .eq("status", "pendente")
          .is("alertada_em", null)
          .lte("created_at", limitePendenteIncerta(agora))
          .order("created_at", { ascending: true })
          .limit(LIMITE_POR_CATEGORIA),
      vale: (nota) => deveAlertarPendenteIncerta(nota, agora),
    },
    {
      tipo: "rejeitada",
      consulta: () =>
        admin
          .from("NotaFiscal")
          .select(COLUNAS_ALERTA)
          .eq("status", "rejeitada")
          .is("alertada_em", null)
          .not("ultimo_erro", "is", null)
          .order("created_at", { ascending: true })
          .limit(LIMITE_POR_CATEGORIA),
      vale: deveAlertarRejeitada,
    },
  ];

  for (const { tipo, consulta, vale } of categorias) {
    try {
      const { data: notas, error } = await consulta();
      if (error) throw new Error(error.message);
      for (const nota of (notas ?? []).filter(vale)) {
        try {
          if (await alertar(nota, tipo)) resumo.alertas++;
        } catch (erro) {
          console.error(`[nfse-reprocessar] erro no alerta ${tipo} (nota ${nota.id}): ${erro?.message ?? erro}`);
        }
      }
    } catch (erro) {
      console.error(`[nfse-reprocessar] falha ao buscar alertas ${tipo}: ${erro?.message ?? erro}`);
    }
  }

  return Response.json(resumo);
}
