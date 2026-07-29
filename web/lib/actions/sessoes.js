"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gerarSessoesAteHorizonte, horizonteAtual } from "@/lib/recorrencia";

export async function criarSessao(prevState, formData) {
  const supabase = await createClient();

  const paciente = Number(formData.get("paciente"));
  const data = formData.get("data");
  const horario = formData.get("horario");
  const duracao_min = Number(formData.get("duracao_min"));
  const tipoSessao = formData.get("tipo_sessao");

  let recorrenciaCriada = null;

  // Semanal/Quinzenal/Mensal: cria a série (Recorrencia) antes da sessão,
  // pra já linkar recorrencia_id na sessão inicial. Avulso não cria série.
  if (tipoSessao !== "Avulso") {
    const { data: recorrencia, error: erroRecorrencia } = await supabase
      .from("Recorrencia")
      .insert({
        paciente,
        frequencia: tipoSessao,
        horario,
        duracao_min,
        tipo_sessao: tipoSessao,
        data_inicio: data,
        gerado_ate: data,
      })
      .select("id, paciente, frequencia, horario, duracao_min, tipo_sessao, data_inicio, gerado_ate")
      .single();

    if (erroRecorrencia) {
      return { error: "Não foi possível criar a recorrência." };
    }
    recorrenciaCriada = recorrencia;
  }

  const { error } = await supabase.from("Sessao").insert({
    paciente,
    data,
    horario,
    duracao_min,
    tipo_sessao: tipoSessao,
    status: "Marcada",
    Realizado: false,
    recorrencia_id: recorrenciaCriada?.id ?? null,
  });

  if (error) {
    return { error: "Não foi possível salvar a sessão." };
  }

  // Estende a série até o horizonte de 3 meses (gera as próximas ocorrências
  // além da sessão inicial que acabou de ser criada).
  if (recorrenciaCriada) {
    await gerarSessoesAteHorizonte(recorrenciaCriada, horizonteAtual());
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/recorrencias");
  redirect("/agenda");
}

export async function atualizarSessao(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({
      paciente: Number(formData.get("paciente")),
      data: formData.get("data"),
      horario: formData.get("horario"),
      duracao_min: Number(formData.get("duracao_min")),
      tipo_sessao: formData.get("tipo_sessao"),
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível atualizar a sessão." };
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect("/agenda");
}

export async function cancelarSessao(sessaoId) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({ status: "Cancelada" })
    .eq("id", sessaoId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect("/agenda");
}

export async function marcarAtendimentoRealizado(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({
      status: "Realizada",
      Realizado: true,
      anotacoes: formData.get("anotacoes") || null,
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível registrar o atendimento." };
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect("/agenda?registrado=1");
}
