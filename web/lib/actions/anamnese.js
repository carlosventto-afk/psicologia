"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buscarAnamnese } from "@/lib/data/anamnese";
import { CAMPOS_ANAMNESE } from "@/lib/anamnese-campos";

function dadosDoFormulario(formData) {
  const dados = {};
  for (const { chave } of CAMPOS_ANAMNESE) {
    dados[chave] = formData.get(chave) || null;
  }
  return dados;
}

function calcularAlteracoes(anamneseAtual, novosValores) {
  const alteracoes = [];
  for (const { chave } of CAMPOS_ANAMNESE) {
    const valorAnterior = anamneseAtual?.[chave] ?? null;
    const valorNovo = novosValores[chave];
    if (valorAnterior !== valorNovo) {
      alteracoes.push({ campo: chave, valor_anterior: valorAnterior, valor_novo: valorNovo });
    }
  }
  return alteracoes;
}

export async function salvarAnamnese(pacienteId, prevState, formData) {
  const anamneseAtual = await buscarAnamnese(pacienteId);
  const novosValores = dadosDoFormulario(formData);
  const alteracoes = calcularAlteracoes(anamneseAtual, novosValores);
  const observacao = formData.get("observacao") || null;

  const supabase = await createClient();

  const { data: anamnese, error: erroUpsert } = await supabase
    .from("Anamnese")
    .upsert(
      { paciente: pacienteId, ...novosValores, atualizado_em: new Date().toISOString() },
      { onConflict: "paciente" }
    )
    .select("id")
    .single();

  if (erroUpsert) {
    return { error: "Não foi possível salvar a anamnese." };
  }

  if (alteracoes.length > 0 || observacao) {
    const { error: erroFollowup } = await supabase
      .from("AnamneseFollowup")
      .insert({ anamnese: anamnese.id, observacao, alteracoes });

    if (erroFollowup) {
      return { error: "Não foi possível salvar a anamnese." };
    }
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}?aba=anamnese`);
}
