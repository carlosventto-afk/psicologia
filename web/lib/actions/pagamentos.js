"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarPagamentoSessao } from "@/lib/pagamento-sessao";

export async function registrarPagamentoSessao(sessaoId, prevState, formData) {
  const supabase = await createClient();
  const valor = Number(formData.get("valor"));
  const conta = Number(formData.get("conta"));
  const formaPagamento = formData.get("forma_pagamento");
  const dataPagamento = formData.get("data_pagamento");

  const { error } = await criarPagamentoSessao(supabase, {
    sessaoId,
    valor,
    contaId: conta,
    formaPagamento,
    dataPagamento,
  });

  if (error) {
    return { error };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  redirect("/agenda");
}
