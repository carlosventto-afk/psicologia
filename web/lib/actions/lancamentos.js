"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { horizonteAtual } from "@/lib/recorrencia";
import { gerarLancamentosAteHorizonte } from "@/lib/recorrencia-despesa";

export async function criarLancamento(prevState, formData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo");
  const data = formData.get("data");
  const descricao = formData.get("descricao");
  const valor = Number(formData.get("valor"));
  const conta = formData.get("conta") ? Number(formData.get("conta")) : null;
  const classificacao = formData.get("classificacao") ? Number(formData.get("classificacao")) : null;
  const frequencia = formData.get("frequencia");

  let recorrenciaCriada = null;

  // Só despesa pode repetir, e só quando o campo "Repetir" do form (que só
  // aparece na tela de criação, ver LancamentoForm) veio preenchido.
  if (tipo === "Despesa" && frequencia && frequencia !== "Nenhuma") {
    const { data: recorrencia, error: erroRecorrencia } = await supabase
      .from("RecorrenciaDespesa")
      .insert({
        descricao,
        valor,
        classificacao,
        conta,
        frequencia,
        data_inicio: data,
        gerado_ate: data,
      })
      .select("id, descricao, valor, classificacao, conta, frequencia, data_inicio, gerado_ate")
      .single();

    if (erroRecorrencia) {
      return { error: "Não foi possível criar a recorrência." };
    }
    recorrenciaCriada = recorrencia;
  }

  const { error } = await supabase.from("LancamentoFinanceiro").insert({
    data,
    descricao,
    valor,
    tipo,
    conta,
    classificacao,
    recorrencia_despesa_id: recorrenciaCriada?.id ?? null,
  });

  if (error) {
    return { error: "Não foi possível salvar o lançamento." };
  }

  // Estende a série além do lançamento inicial que acabou de ser criado.
  if (recorrenciaCriada) {
    await gerarLancamentosAteHorizonte(recorrenciaCriada, horizonteAtual());
  }

  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/recorrencias");
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
      classificacao: formData.get("classificacao") ? Number(formData.get("classificacao")) : null,
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
