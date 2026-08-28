"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";
import { cpfValido } from "@/lib/carne-leao-txt";
import {
  criarClienteAsaas,
  criarAssinaturaAsaas,
  buscarAssinaturaAsaas,
  buscarPrimeiroPagamentoAssinatura,
  atualizarAssinaturaAsaas,
  cancelarAssinaturaAsaas,
} from "@/lib/asaas";

// As colunas plano_pretendido / plano_pretendido_a_partir_de / asaas_customer_id /
// asaas_subscription_id / assinatura_status são protegidas por GRANT/REVOKE de
// coluna, não RLS (ver migration 20260827000001_add_assinatura_usuarios.sql):
// UPDATE foi revogado a nível de tabela pro role `authenticated` e devolvido
// via GRANT explícito só nas colunas de cadastro (não nas de cobrança) — só
// service_role escreve essas colunas. Aqui não precisa de um check explícito
// de role: `usuario` vem de buscarUsuarioAtual(), que já resolve o id a partir
// de auth.getUser() da sessão atual, então todo `.eq("id", usuario.id)` abaixo
// sempre aponta pra própria linha de quem está logado — nunca um id vindo de
// input do cliente.
export async function escolherPlano(planoAlvo, prevState, formData) {
  const usuario = await buscarUsuarioAtual();
  const admin = createAdminClient();

  // Assinatura "viva" = existe um asaas_subscription_id E já tivemos alguma
  // confirmação de status pra ela (ativa/inadimplente). Se assinatura_status
  // ainda é null/undefined com um asaas_subscription_id presente, é um
  // checkout abandonado (nenhum webhook chegou a confirmar) -- tratamos como
  // se não houvesse assinatura viva, pra permitir tentar de novo.
  const temAssinaturaViva =
    Boolean(usuario.asaas_subscription_id) &&
    Boolean(usuario.assinatura_status) &&
    usuario.assinatura_status !== "cancelada";

  // Um profissional inadimplente tem usuario.plano rebaixado pra "gratis",
  // mas ainda pode ter uma assinatura viva no Asaas pra cancelar -- nesse
  // caso não bloqueia com "você já está nesse plano", deixa prosseguir pro
  // cancelamento.
  if (planoAlvo === usuario.plano && !(planoAlvo === "gratis" && temAssinaturaViva)) {
    return { error: "Você já está nesse plano." };
  }

  if (!temAssinaturaViva) {
    if (planoAlvo === "gratis") {
      return { error: "Você já está no plano Grátis." };
    }

    if (!cpfValido(usuario.cpf)) {
      return { error: "Cadastre seu CPF em Meus Dados antes de assinar um plano." };
    }

    let asaasCustomerId = usuario.asaas_customer_id;
    if (!asaasCustomerId) {
      let cliente;
      try {
        cliente = await criarClienteAsaas({ nome: usuario.nome, cpf: usuario.cpf });
      } catch (err) {
        return { error: "Não foi possível criar seu cadastro de cobrança. Tente novamente." };
      }
      asaasCustomerId = cliente.id;
    }

    let assinatura;
    try {
      assinatura = await criarAssinaturaAsaas({
        customerId: asaasCustomerId,
        value: PLANOS[planoAlvo].preco,
        description: `PsiAgente — ${PLANOS[planoAlvo].nome}`,
      });
    } catch (err) {
      return { error: "Não foi possível iniciar a assinatura. Tente novamente." };
    }

    let primeiroPagamento = null;
    try {
      primeiroPagamento = await buscarPrimeiroPagamentoAssinatura(assinatura.id);
    } catch (err) {
      primeiroPagamento = null;
    }

    const linkPagamento = primeiroPagamento?.invoiceUrl;
    if (!linkPagamento) {
      return { error: "Não foi possível gerar o link de pagamento. Tente novamente." };
    }

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

    redirect(linkPagamento);
  }

  let assinaturaAtual;
  try {
    assinaturaAtual = await buscarAssinaturaAsaas(usuario.asaas_subscription_id);
  } catch (err) {
    return { error: "Não foi possível consultar sua assinatura. Tente novamente." };
  }

  try {
    if (planoAlvo === "gratis") {
      await cancelarAssinaturaAsaas(usuario.asaas_subscription_id);
    } else {
      await atualizarAssinaturaAsaas(usuario.asaas_subscription_id, { value: PLANOS[planoAlvo].preco });
    }
  } catch (err) {
    return { error: "Não foi possível atualizar sua assinatura. Tente novamente." };
  }

  const dadosAtualizacao =
    planoAlvo === "gratis"
      ? {
          plano_pretendido: planoAlvo,
          plano_pretendido_a_partir_de: assinaturaAtual.nextDueDate,
          // Limpa o estado de assinatura pra que uma futura tentativa de
          // assinar de novo não caia na checagem de "assinatura viva" e tente
          // buscar no Asaas um id que já foi cancelado (404).
          assinatura_status: "cancelada",
          asaas_subscription_id: null,
        }
      : {
          plano_pretendido: planoAlvo,
          plano_pretendido_a_partir_de: assinaturaAtual.nextDueDate,
        };

  const { error } = await admin.from("Usuarios").update(dadosAtualizacao).eq("id", usuario.id);

  if (error) {
    return { error: "Não foi possível agendar a troca de plano. Tente novamente." };
  }

  revalidatePath("/assinatura");
  const dataFormatada = new Date(`${assinaturaAtual.nextDueDate}T00:00:00`).toLocaleDateString("pt-BR");
  return { sucesso: `Sua mudança pra ${PLANOS[planoAlvo].nome} entra em vigor em ${dataFormatada}.` };
}
