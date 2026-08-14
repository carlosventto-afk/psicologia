"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarLancamento(prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase.from("LancamentoFinanceiro").insert({
    data: formData.get("data"),
    descricao: formData.get("descricao"),
    valor: Number(formData.get("valor")),
    tipo: formData.get("tipo"),
    conta: formData.get("conta") ? Number(formData.get("conta")) : null,
  });

  if (error) {
    return { error: "Não foi possível salvar o lançamento." };
  }

  revalidatePath("/financeiro/lancamentos");
  redirect("/financeiro/lancamentos");
}

export async function atualizarLancamento(id, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("LancamentoFinanceiro")
    .update({
      data: formData.get("data"),
      descricao: formData.get("descricao"),
      valor: Number(formData.get("valor")),
      tipo: formData.get("tipo"),
      conta: formData.get("conta") ? Number(formData.get("conta")) : null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o lançamento." };
  }

  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
  redirect("/financeiro/lancamentos");
}

export async function excluirLancamento(id) {
  const supabase = await createClient();

  // PagamentoSessao.lancamento -> LancamentoFinanceiro.id não tem cascade
  // (NO ACTION), então um lançamento originado de um pagamento de sessão
  // precisa ter esse vínculo removido primeiro. Isso também "desmarca" a
  // sessão como paga, já que o status pago é derivado só da existência do
  // registro em PagamentoSessao (ver web/lib/data/sessoes.js) — comportamento
  // desejado: excluir o lançamento desfaz o pagamento por completo.
  const { error: erroPagamento } = await supabase
    .from("PagamentoSessao")
    .delete()
    .eq("lancamento", id);

  if (erroPagamento) {
    throw new Error("Não foi possível excluir o lançamento.");
  }

  const { error } = await supabase.from("LancamentoFinanceiro").delete().eq("id", id);

  if (error) {
    throw new Error("Não foi possível excluir o lançamento.");
  }

  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
  revalidatePath("/agenda");
}
