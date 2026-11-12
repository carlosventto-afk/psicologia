// Emite as notas da cobrança e entrega as autorizadas (e-mail/WhatsApp).
// Nunca lança: falha de entrega não desfaz a emissão e vira apenas log.
import { emitirNotasDaCobranca } from "@/lib/nfse-emissao";
import { entregarNota } from "@/lib/nfse-entrega";

export async function emitirEEntregarCobranca(supabase, cobrancaId) {
  let resultado;
  try {
    resultado = await emitirNotasDaCobranca(supabase, cobrancaId);
  } catch (e) {
    console.error(`NFS-e: falha ao emitir (cobranca ${cobrancaId}): ${e?.message ?? e}`);
    return { notas: [], pendencia: "Não foi possível emitir a nota agora." };
  }

  for (const nota of resultado?.notas ?? []) {
    if (nota.status !== "autorizada") continue;
    try {
      await entregarNota(supabase, nota.id);
    } catch (e) {
      console.error(`NFS-e: falha ao entregar nota ${nota.id} (cobranca ${cobrancaId}): ${e?.message ?? e}`);
    }
  }
  return { notas: resultado?.notas ?? [], pendencia: resultado?.pendencia };
}
