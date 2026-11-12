"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitirEEntregarCobranca } from "@/lib/nfse-emitir-entregar";

// Botão "Emitir nota" / "Tentar de novo" da cobrança. Nunca lança: falha esperada
// volta como { error } (o Next redige o texto de erros lançados em produção).
export async function emitirNotaDaCobranca(cobrancaId) {
  try {
    const id = Number(cobrancaId);
    if (!Number.isInteger(id) || id <= 0) return { error: "Cobrança inválida." };

    const supabase = await createClient();
    const { notas, pendencia } = await emitirEEntregarCobranca(supabase, id);

    revalidatePath(`/cobrancas/${id}`);
    revalidatePath("/notas-fiscais");

    if (notas.length === 0) return { error: pendencia ?? "Não foi possível emitir a nota." };
    if (!notas.some((n) => n.status === "autorizada")) {
      const comErro = notas.find((n) => n.erro);
      return { error: comErro?.erro ?? pendencia ?? "A nota não foi autorizada." };
    }
    return { ok: true, notas };
  } catch (e) {
    console.error(`NFS-e: erro inesperado na emissão manual (cobranca ${cobrancaId}): ${e?.message ?? e}`);
    return { error: "Não foi possível emitir a nota agora. Tente de novo em instantes." };
  }
}
