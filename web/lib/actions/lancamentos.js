"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { horizonteAtual } from "@/lib/recorrencia";
import { gerarLancamentosAteHorizonte } from "@/lib/recorrencia-despesa";

// O form já filtra as opções pelo tipo (ver LancamentoForm), mas isso é só
// UX — sem essa checagem no servidor dava pra mandar qualquer id de
// classificação direto no formData e vincular uma classificação de Despesa
// a uma Receita (ou vice-versa), o que quebra o propósito do plano de
// contas (relatórios futuros por classificação+tipo ficariam inconsistentes).
async function classificacaoValidaParaTipo(supabase, classificacaoId, tipo) {
  if (!classificacaoId) return true;

  const { data, error } = await supabase
    .from("ClassificacaoFinanceira")
    .select("tipo")
    .eq("id", classificacaoId)
    .single();

  if (error) return false;
  return data.tipo === "Ambos" || data.tipo === tipo;
}

export async function criarLancamento(prevState, formData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo");
  const data = formData.get("data");
  const descricao = formData.get("descricao");
  const valor = Number(formData.get("valor"));
  const conta = formData.get("conta") ? Number(formData.get("conta")) : null;
  const classificacao = formData.get("classificacao") ? Number(formData.get("classificacao")) : null;
  const frequencia = formData.get("frequencia");

  if (!(await classificacaoValidaParaTipo(supabase, classificacao, tipo))) {
    return { error: "Essa classificação não é válida para o tipo selecionado." };
  }

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
    // Sem o lançamento inicial, a série ficaria órfã (ativa, sem nenhum
    // lançamento vinculado) e garantirRecorrenciasDespesaEstendidas passaria
    // a gerar despesas futuras que o usuário nunca confirmou.
    if (recorrenciaCriada) {
      await supabase.from("RecorrenciaDespesa").delete().eq("id", recorrenciaCriada.id);
    }
    return { error: "Não foi possível salvar o lançamento." };
  }

  // Estende a série além do lançamento inicial que acabou de ser criado.
  if (recorrenciaCriada) {
    await gerarLancamentosAteHorizonte(recorrenciaCriada, horizonteAtual());
  }

  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/recorrencias");
  revalidatePath("/financeiro");
  redirect("/financeiro/lancamentos");
}

export async function atualizarLancamento(id, prevState, formData) {
  const supabase = await createClient();

  const tipo = formData.get("tipo");
  const classificacao = formData.get("classificacao") ? Number(formData.get("classificacao")) : null;

  if (!(await classificacaoValidaParaTipo(supabase, classificacao, tipo))) {
    return { error: "Essa classificação não é válida para o tipo selecionado." };
  }

  const { error } = await supabase
    .from("LancamentoFinanceiro")
    .update({
      data: formData.get("data"),
      descricao: formData.get("descricao"),
      valor: Number(formData.get("valor")),
      tipo,
      conta: formData.get("conta") ? Number(formData.get("conta")) : null,
      classificacao,
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
