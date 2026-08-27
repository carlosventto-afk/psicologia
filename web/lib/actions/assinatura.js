"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";
import {
  criarClienteAsaas,
  criarAssinaturaAsaas,
  buscarAssinaturaAsaas,
  atualizarAssinaturaAsaas,
  cancelarAssinaturaAsaas,
} from "@/lib/asaas";

// As colunas plano_pretendido / plano_pretendido_a_partir_de / asaas_customer_id /
// asaas_subscription_id são bloqueadas pra UPDATE via RLS pro role `authenticated`
// (ver migration 20260827000001_add_assinatura_usuarios.sql) — só service_role
// escreve nelas. Aqui não precisa de um check explícito de role: `usuario` vem de
// buscarUsuarioAtual(), que já resolve o id a partir de auth.getUser() da sessão
// atual, então todo `.eq("id", usuario.id)` abaixo sempre aponta pra própria linha
// de quem está logado — nunca um id vindo de input do cliente.
export async function escolherPlano(planoAlvo, prevState, formData) {
  const usuario = await buscarUsuarioAtual();
  const admin = createAdminClient();

  if (planoAlvo === usuario.plano) {
    return { error: "Você já está nesse plano." };
  }

  const semAssinaturaAtiva = !usuario.asaas_subscription_id || usuario.assinatura_status === "cancelada";

  if (semAssinaturaAtiva) {
    if (planoAlvo === "gratis") {
      return { error: "Você já está no plano Grátis." };
    }

    let asaasCustomerId = usuario.asaas_customer_id;
    if (!asaasCustomerId) {
      const cliente = await criarClienteAsaas({ nome: usuario.nome, cpf: usuario.cpf });
      asaasCustomerId = cliente.id;
    }

    const assinatura = await criarAssinaturaAsaas({
      customerId: asaasCustomerId,
      value: PLANOS[planoAlvo].preco,
      description: `PsiAgente — ${PLANOS[planoAlvo].nome}`,
    });

    const { error } = await admin
      .from("Usuarios")
      .update({
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: assinatura.id,
        plano_pretendido: planoAlvo,
        plano_pretendido_a_partir_de: null,
      })
      .eq("id", usuario.id);

    if (error) {
      return { error: "Não foi possível iniciar a assinatura. Tente novamente." };
    }

    redirect(assinatura.invoiceUrl);
  }

  const assinaturaAtual = await buscarAssinaturaAsaas(usuario.asaas_subscription_id);

  if (planoAlvo === "gratis") {
    await cancelarAssinaturaAsaas(usuario.asaas_subscription_id);
  } else {
    await atualizarAssinaturaAsaas(usuario.asaas_subscription_id, { value: PLANOS[planoAlvo].preco });
  }

  const { error } = await admin
    .from("Usuarios")
    .update({
      plano_pretendido: planoAlvo,
      plano_pretendido_a_partir_de: assinaturaAtual.nextDueDate,
    })
    .eq("id", usuario.id);

  if (error) {
    return { error: "Não foi possível agendar a troca de plano. Tente novamente." };
  }

  revalidatePath("/assinatura");
  const dataFormatada = new Date(`${assinaturaAtual.nextDueDate}T00:00:00`).toLocaleDateString("pt-BR");
  return { sucesso: `Sua mudança pra ${PLANOS[planoAlvo].nome} entra em vigor em ${dataFormatada}.` };
}
