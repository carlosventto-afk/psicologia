"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function cancelarRecorrenciaDespesa(recorrenciaId) {
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { error: erroRecorrencia } = await supabase
    .from("RecorrenciaDespesa")
    .update({ ativa: false, cancelada_em: new Date().toISOString() })
    .eq("id", recorrenciaId);

  if (erroRecorrencia) return;

  // Remove só os lançamentos futuros ainda não "acontecidos" — histórico
  // fica intacto (mesma regra usada pra cancelar sessões futuras de uma
  // recorrência em lib/actions/recorrencias.js).
  await supabase
    .from("LancamentoFinanceiro")
    .delete()
    .eq("recorrencia_despesa_id", recorrenciaId)
    .gte("data", hoje);

  revalidatePath("/financeiro/recorrencias");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
}
