"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function registrarPagamentoSessao(sessaoId, prevState, formData) {
  const supabase = await createClient();
  const valor = Number(formData.get("valor"));
  const conta = Number(formData.get("conta"));
  const formaPagamento = formData.get("forma_pagamento");

  const { data: lancamento, error: erroLancamento } = await supabase
    .from("LancamentoFinanceiro")
    .insert({
      data: new Date().toISOString().slice(0, 10),
      descricao: "Pagamento de sessão",
      valor,
      tipo: "Receita",
      conta,
      sessao: sessaoId,
    })
    .select("id")
    .single();

  if (erroLancamento) {
    return { error: "Não foi possível registrar o pagamento." };
  }

  const { error: erroPagamento } = await supabase.from("PagamentoSessao").insert({
    sessao: sessaoId,
    valor,
    data_pagamento: new Date().toISOString().slice(0, 10),
    forma_pagamento: formaPagamento,
    conta,
    lancamento: lancamento.id,
  });

  if (erroPagamento) {
    return { error: "Não foi possível registrar o pagamento." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  redirect("/agenda");
}
