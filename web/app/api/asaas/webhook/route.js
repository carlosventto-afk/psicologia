import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const token = request.headers.get("asaas-access-token");
  if (!token || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const evento = await request.json();
  const admin = createAdminClient();

  const subscriptionId = evento.payment?.subscription ?? null;
  let usuario = null;
  if (subscriptionId) {
    const { data } = await admin
      .from("Usuarios")
      .select("id, plano_pago, plano_pretendido, plano_pretendido_a_partir_de")
      .eq("asaas_subscription_id", subscriptionId)
      .maybeSingle();
    usuario = data;
  }

  const { error: erroInsert } = await admin.from("EventoAssinatura").insert({
    usuario: usuario?.id ?? null,
    asaas_event_id: evento.id,
    tipo: evento.event,
    payload: evento,
  });

  if (erroInsert) {
    // Evento duplicado (unique constraint em asaas_event_id) -> ja
    // processado antes, ignora sem tratar como falha (entrega "pelo menos
    // uma vez" do Asaas pode repetir o mesmo evento).
    if (erroInsert.code === "23505") {
      return new Response("OK (evento duplicado, ignorado).", { status: 200 });
    }
    console.error("Falha ao registrar EventoAssinatura:", erroInsert);
    return new Response("Erro ao registrar evento.", { status: 500 });
  }

  if (!usuario) {
    return new Response("OK (assinatura não encontrada).", { status: 200 });
  }

  let erroAtualizacao = null;

  if (evento.event === "PAYMENT_CONFIRMED" || evento.event === "PAYMENT_RECEIVED") {
    const pendenciaLiberada =
      usuario.plano_pretendido &&
      (!usuario.plano_pretendido_a_partir_de || new Date(usuario.plano_pretendido_a_partir_de) <= new Date());

    const atualizacao = { assinatura_status: "ativa", assinatura_vencida_em: null };

    if (pendenciaLiberada) {
      atualizacao.plano = usuario.plano_pretendido;
      atualizacao.plano_pago = usuario.plano_pretendido;
      atualizacao.plano_pretendido = null;
      atualizacao.plano_pretendido_a_partir_de = null;
    } else if (usuario.plano_pago) {
      atualizacao.plano = usuario.plano_pago;
    }

    const { error } = await admin.from("Usuarios").update(atualizacao).eq("id", usuario.id);
    erroAtualizacao = error;
  } else if (evento.event === "PAYMENT_OVERDUE") {
    const { error } = await admin
      .from("Usuarios")
      .update({ assinatura_status: "inadimplente", assinatura_vencida_em: new Date().toISOString() })
      .eq("id", usuario.id);
    erroAtualizacao = error;
  }

  if (erroAtualizacao) {
    // A linha de EventoAssinatura já foi gravada com o default
    // (processado_com_sucesso = true) -- corrige aqui pra registrar que a
    // atualização em Usuarios falhou, senão a tabela de auditoria fica
    // afirmando sucesso num evento que não aplicou a mudança de plano.
    await admin
      .from("EventoAssinatura")
      .update({ processado_com_sucesso: false, mensagem_erro: erroAtualizacao.message })
      .eq("asaas_event_id", evento.id);
  }

  return new Response("OK", { status: 200 });
}
