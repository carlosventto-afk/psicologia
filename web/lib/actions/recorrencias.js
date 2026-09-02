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

  // Só mexe em sessões futuras ainda não realizadas — histórico fica intacto.
  const { data: futuras, error: erroFuturas } = await supabase
    .from("Sessao")
    .select("id, RecebimentoSessao(id)")
    .eq("recorrencia_id", recorrenciaId)
    .eq("Realizado", false)
    .gte("data", hoje);

  if (erroFuturas || !futuras) return;

  const semRecebimento = futuras.filter((s) => (s.RecebimentoSessao ?? []).length === 0).map((s) => s.id);
  const comRecebimento = futuras.filter((s) => (s.RecebimentoSessao ?? []).length > 0).map((s) => s.id);

  // Sem recebimento aplicado: apaga de vez — não há razão pra manter linha
  // "Cancelada" acumulando na tabela. Com recebimento: mantém e só marca como
  // cancelada, senão perderíamos o vínculo financeiro (FK bloquearia o delete).
  if (semRecebimento.length > 0) {
    await supabase.from("Sessao").delete().in("id", semRecebimento);
  }
  if (comRecebimento.length > 0) {
    await supabase.from("Sessao").update({ status: "Cancelada" }).in("id", comRecebimento);
  }

  revalidatePath("/recorrencias");
  revalidatePath("/agenda");
  revalidatePath("/");
}
