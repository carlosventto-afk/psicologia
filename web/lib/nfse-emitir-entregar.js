// Emite as notas da cobrança e entrega as autorizadas (e-mail/WhatsApp).
// Nunca lança: falha de entrega não desfaz a emissão e vira apenas log.
import { emitirNotasDaCobranca } from "@/lib/nfse-emissao";
import { entregarNota } from "@/lib/nfse-entrega";
import { pendenciaParaGravar } from "@/lib/nota-fiscal";

// Guarda o motivo da pendência (sem nota) em Cobranca.nota_pendencia; limpa quando
// alguma nota foi criada. Só loga erro de gravação.
async function gravarNotaPendencia(supabase, cobrancaId, resultado) {
  try {
    const valor = pendenciaParaGravar(resultado);
    if (valor === undefined) return;
    const { error } = await supabase.from("Cobranca").update({ nota_pendencia: valor }).eq("id", cobrancaId);
    if (error) console.error(`NFS-e: não gravou nota_pendencia (cobranca ${cobrancaId}): ${error.message}`);
  } catch (e) {
    console.error(`NFS-e: não gravou nota_pendencia (cobranca ${cobrancaId}): ${e?.message ?? e}`);
  }
}

// Usado pelo gatilho automático (after) e pelo botão manual: ambos gravam a pendência.
export async function emitirEEntregarCobranca(supabase, cobrancaId) {
  const r = await emitirEEntregar(supabase, cobrancaId);
  await gravarNotaPendencia(supabase, cobrancaId, r);
  return r;
}

async function emitirEEntregar(supabase, cobrancaId) {
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
