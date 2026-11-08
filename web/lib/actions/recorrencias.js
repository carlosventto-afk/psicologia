"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemBloqueioOu, primeiraCobrancaAberta } from "@/lib/cobranca";

// Devolve { error } (null em caso de sucesso). Nada e alterado se alguma
// sessao futura da serie estiver em cobranca aberta.
export async function cancelarRecorrencia(recorrenciaId) {
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  // Só mexe em sessões futuras ainda não realizadas — histórico fica intacto.
  const { data: futuras, error: erroFuturas } = await supabase
    .from("Sessao")
    .select("id, data, RecebimentoSessao(id), CobrancaSessao(ativa, Cobranca(id, situacao))")
    .eq("recorrencia_id", recorrenciaId)
    .eq("Realizado", false)
    .gte("data", hoje);

  if (erroFuturas || !futuras) {
    return { error: "Não foi possível cancelar a recorrência." };
  }

  // Sessao em cobranca aberta nao pode ser apagada nem cancelada (trigger):
  // aborta antes de desativar a serie, pra nao deixar a serie pela metade.
  for (const s of futuras) {
    const cobrancaId = primeiraCobrancaAberta(s.CobrancaSessao);
    if (cobrancaId !== null) {
      return {
        error: `Não foi possível cancelar a recorrência: a sessão de ${s.data} está na cobrança #${cobrancaId} (aberta). Cancele ou receba a cobrança antes.`,
      };
    }
  }

  const { error: erroRecorrencia } = await supabase
    .from("Recorrencia")
    .update({ ativa: false, cancelada_em: new Date().toISOString() })
    .eq("id", recorrenciaId);

  if (erroRecorrencia) {
    return { error: "Não foi possível cancelar a recorrência." };
  }

  const semRecebimento = futuras.filter((s) => (s.RecebimentoSessao ?? []).length === 0).map((s) => s.id);
  const comRecebimento = futuras.filter((s) => (s.RecebimentoSessao ?? []).length > 0).map((s) => s.id);

  // Sem recebimento aplicado: apaga de vez — não há razão pra manter linha
  // "Cancelada" acumulando na tabela. Com recebimento: mantém e só marca como
  // cancelada, senão perderíamos o vínculo financeiro (FK bloquearia o delete).
  if (semRecebimento.length > 0) {
    const { error } = await supabase.from("Sessao").delete().in("id", semRecebimento);
    if (error) {
      return { error: mensagemBloqueioOu(error, "A recorrência foi desativada, mas não foi possível apagar todas as sessões futuras.") };
    }
  }
  if (comRecebimento.length > 0) {
    const { error } = await supabase.from("Sessao").update({ status: "Cancelada" }).in("id", comRecebimento);
    if (error) {
      return { error: mensagemBloqueioOu(error, "A recorrência foi desativada, mas não foi possível cancelar todas as sessões futuras.") };
    }
  }

  revalidatePath("/recorrencias");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  return { error: null };
}

// Usada pelo botao da tela de recorrencias (form action sem estado): falha
// de forma visivel em vez de agir como se tudo tivesse dado certo.
export async function cancelarRecorrenciaForm(recorrenciaId) {
  const { error } = await cancelarRecorrencia(recorrenciaId);
  if (error) redirect(`/recorrencias?erro=${encodeURIComponent(error)}`);
}
