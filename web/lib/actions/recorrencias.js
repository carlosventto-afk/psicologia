"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function cancelarRecorrencia(recorrenciaId) {
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { error: erroRecorrencia } = await supabase
    .from("Recorrencia")
    .update({ ativa: false, cancelada_em: new Date().toISOString() })
    .eq("id", recorrenciaId);

  if (erroRecorrencia) return;

  // Só cancela sessões futuras ainda não realizadas — histórico fica intacto.
  await supabase
    .from("Sessao")
    .update({ status: "Cancelada" })
    .eq("recorrencia_id", recorrenciaId)
    .eq("Realizado", false)
    .gte("data", hoje);

  revalidatePath("/recorrencias");
  revalidatePath("/agenda");
  revalidatePath("/");
}
