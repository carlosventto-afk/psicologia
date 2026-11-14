"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chamarServicoNfse } from "@/lib/nfse-client";
import { entregarNota } from "@/lib/nfse-entrega";
import {
  notaVerificavelNaSefin,
  decidirVerificacaoSefin,
  montarAtualizacaoVerificadaAutorizada,
  montarAtualizacaoVerificadaNaoEmitida,
} from "@/lib/nota-fiscal";

const INDISPONIVEL =
  "A SEFIN não respondeu com certeza. A nota continua pendente; tente verificar de novo em alguns minutos e não emita de novo.";

// Botão "Verificar na SEFIN": resolve uma nota pendente de resultado incerto.
// Dono da nota (RLS) ou admin. Nunca lança: falha esperada volta como { error }.
// Uso: useActionState(verificarNotaNaSefin.bind(null, notaId), {}).
export async function verificarNotaNaSefin(notaId, _prevState, _formData) {
  try {
    const id = Number(notaId);
    if (!Number.isInteger(id) || id <= 0) return { error: "Nota inválida." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Não autorizado." };

    // O select via RLS só devolve a nota para o dono ou para um admin.
    const { data: nota, error: erroNota } = await supabase
      .from("NotaFiscal")
      .select("id, owner, status, ambiente, serie, numero, ultimo_erro, created_at")
      .eq("id", id)
      .maybeSingle();
    if (erroNota || !nota) return { error: "Nota não encontrada." };

    let db = supabase;
    if (nota.owner !== user.id) {
      const { data: atual } = await supabase.from("Usuarios").select("role").eq("id_user", user.id).maybeSingle();
      if (atual?.role !== "admin") return { error: "Não autorizado." };
      // Admin agindo sobre nota de outro profissional: dados fiscais (certificado) e
      // entrega não são visíveis pela RLS do admin; o papel já foi conferido acima.
      db = createAdminClient();
    }

    if (nota.status !== "pendente") return { error: "Só é possível verificar notas pendentes." };
    if (!notaVerificavelNaSefin(nota)) {
      return { error: "A nota ainda está sendo emitida. Aguarde alguns minutos e tente de novo." };
    }

    const { data: fiscal, error: erroFiscal } = await db
      .from("DadosFiscaisProfissional")
      .select("documento, municipio_ibge, certificado_pfx_cifrado, certificado_senha_cifrada")
      .eq("owner", nota.owner)
      .maybeSingle();
    if (erroFiscal || !fiscal) return { error: "Dados fiscais do profissional não encontrados." };

    let resposta;
    try {
      resposta = await chamarServicoNfse("/consultar-dps", {
        ambiente: nota.ambiente,
        certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
        certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
        serie: nota.serie,
        numero: nota.numero,
        prestador_documento: fiscal.documento,
        municipio_ibge: fiscal.municipio_ibge,
      });
    } catch (e) {
      console.error(`NFS-e: consulta de DPS falhou (nota ${id}): ${e?.message ?? e}`);
      return { error: INDISPONIVEL };
    }

    const decisao = decidirVerificacaoSefin(resposta);
    if (decisao === "manter") return { error: INDISPONIVEL };

    const colunas =
      decisao === "autorizar"
        ? montarAtualizacaoVerificadaAutorizada(resposta)
        : montarAtualizacaoVerificadaNaoEmitida(resposta);

    // Guarda por status: se outra execução já resolveu a nota, não sobrescreve.
    const { data: gravada, error: erroGravar } = await db
      .from("NotaFiscal")
      .update(colunas)
      .eq("id", id)
      .eq("status", "pendente")
      .select("id");
    if (erroGravar) {
      console.error(`NFS-e: não gravou a verificação (nota ${id}, decisao ${decisao}): ${erroGravar.message}`);
      return { error: "A SEFIN respondeu, mas não foi possível gravar o resultado. Tente de novo." };
    }
    if (!gravada?.length) return { error: "A nota mudou de estado enquanto era verificada. Recarregue a página." };

    revalidatePath("/notas-fiscais");
    revalidatePath("/cobrancas", "layout");

    if (decisao === "liberar") {
      return { ok: true, mensagem: "A SEFIN não tem essa nota. Ela foi marcada como rejeitada: use \"Tentar de novo\" para emitir." };
    }

    // Autorizada: entrega idempotente (claim-first); falha vira só log e o job horário retoma.
    try {
      await entregarNota(db, id);
    } catch (e) {
      console.error(`NFS-e: falha ao entregar nota verificada ${id}: ${e?.message ?? e}`);
    }
    return { ok: true, mensagem: "A nota foi autorizada na SEFIN e já está registrada. A entrega ao paciente foi acionada." };
  } catch (e) {
    console.error(`NFS-e: erro inesperado ao verificar nota ${notaId}: ${e?.message ?? e}`);
    return { error: "Não foi possível verificar a nota agora. Tente de novo em instantes." };
  }
}
