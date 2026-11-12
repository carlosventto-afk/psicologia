// Entrega da NFS-e autorizada ao tomador (e-mail e WhatsApp).
//
// Contrato: entregarNota NUNCA lança. Cada canal é independente (falha de um não
// impede o outro) e idempotente (enviada_*_em já preenchido nunca reenvia).
// Só entrega em ambiente de produção; homologação fica "pulado".

import { enviarEmailNotaFiscal } from "@/lib/email";
import { enviarWhatsapp, enviarDocumentoWhatsApp } from "@/lib/whatsapp";
import {
  canaisDeEntrega,
  montarMensagemWhatsappNota,
  normalizarTelefoneWhatsapp,
} from "@/lib/nota-fiscal";

const PULADO = { email: "pulado", whatsapp: "pulado" };

// Paciente da nota: pela cobrança ou pelo rateio (RecebimentoSessao -> Sessao).
async function buscarPacienteId(supabase, nota) {
  if (nota.cobranca) {
    const { data, error } = await supabase.from("Cobranca").select("paciente").eq("id", nota.cobranca).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.paciente ?? null;
  }
  if (nota.recebimento_sessao) {
    const { data, error } = await supabase
      .from("RecebimentoSessao")
      .select("Sessao(paciente)")
      .eq("id", nota.recebimento_sessao)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.Sessao?.paciente ?? null;
  }
  return null;
}

// Update que não casa nenhuma linha (ex.: RLS) conta como falha.
async function gravar(supabase, notaId, colunas) {
  const { data, error } = await supabase.from("NotaFiscal").update(colunas).eq("id", notaId).select("id");
  if (error) return error;
  if (!Array.isArray(data) || data.length === 0) return new Error("nenhuma linha atualizada");
  return null;
}

export async function entregarNota(supabase, notaId) {
  try {
    const { data: nota, error: erroNota } = await supabase
      .from("NotaFiscal")
      .select(
        "id, owner, status, cobranca, recebimento_sessao, chave_acesso, xml_nfse, pdf_base64, tomador_nome, tomador_email, tomador_telefone, enviada_email_em, enviada_whatsapp_em, ultimo_erro",
      )
      .eq("id", notaId)
      .maybeSingle();
    if (erroNota || !nota || nota.status !== "autorizada") return { ...PULADO };

    const pacienteId = await buscarPacienteId(supabase, nota);
    const [fiscalRes, usuarioRes, pacienteRes] = await Promise.all([
      supabase.from("DadosFiscaisProfissional").select("ambiente").eq("owner", nota.owner).maybeSingle(),
      supabase.from("Usuarios").select("nome").eq("id_user", nota.owner).maybeSingle(),
      pacienteId
        ? supabase.from("Paciente").select("whatsapp_lembrete_opt_in").eq("id", pacienteId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    for (const r of [fiscalRes, usuarioRes, pacienteRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const canais = canaisDeEntrega({
      ambiente: fiscalRes.data?.ambiente,
      tomador: { email: nota.tomador_email, telefone: nota.tomador_telefone },
      optInWhatsapp: pacienteRes.data?.whatsapp_lembrete_opt_in === true,
      jaEnviadoEmail: Boolean(nota.enviada_email_em),
      jaEnviadoWhatsapp: Boolean(nota.enviada_whatsapp_em),
    });

    const resultado = { ...PULADO };
    const erros = [];
    const colunas = {};

    if (canais.email) {
      try {
        // xml_nfse guarda o texto decodificado; o e-mail espera base64.
        const xmlBase64 = Buffer.from(nota.xml_nfse ?? "", "utf8").toString("base64");
        await enviarEmailNotaFiscal({
          paraEmail: String(nota.tomador_email).trim(),
          pacienteNome: nota.tomador_nome ?? "",
          xmlBase64,
          pdfBase64: nota.pdf_base64 || undefined,
        });
        resultado.email = "enviado";
        colunas.enviada_email_em = new Date().toISOString();
      } catch (erro) {
        resultado.email = "falhou";
        erros.push(`e-mail: ${erro?.message ?? erro}`);
      }
    }

    if (canais.whatsapp) {
      try {
        const numero = normalizarTelefoneWhatsapp(nota.tomador_telefone);
        if (!numero) throw new Error("telefone do tomador inválido");
        const mensagem = montarMensagemWhatsappNota({
          nomeProfissional: usuarioRes.data?.nome ?? "seu profissional",
          chave: nota.chave_acesso,
        });
        const { error } = nota.pdf_base64
          ? await enviarDocumentoWhatsApp({
              numero,
              base64: nota.pdf_base64,
              nomeArquivo: "nota-fiscal.pdf",
              legenda: mensagem,
            })
          : await enviarWhatsapp({ numero, mensagem });
        if (error) throw error;
        resultado.whatsapp = "enviado";
        colunas.enviada_whatsapp_em = new Date().toISOString();
      } catch (erro) {
        resultado.whatsapp = "falhou";
        erros.push(`WhatsApp: ${erro?.message ?? erro}`);
      }
    }

    if (erros.length > 0) {
      colunas.ultimo_erro = `Falha na entrega (${erros.join("; ")})`;
    }
    if (Object.keys(colunas).length > 0) {
      const erroGravar = await gravar(supabase, nota.id, colunas);
      if (erroGravar) {
        // Enviou mas não registrou: reporta falha (pode haver reenvio numa próxima tentativa).
        console.error(`[nfse-entrega] entrega não registrada (nota ${nota.id}): ${erroGravar.message}`);
        if (colunas.enviada_email_em) resultado.email = "falhou";
        if (colunas.enviada_whatsapp_em) resultado.whatsapp = "falhou";
      }
    }

    return resultado;
  } catch (erro) {
    console.error(`[nfse-entrega] erro inesperado (nota ${notaId}): ${erro?.message ?? erro}`);
    return { email: "falhou", whatsapp: "falhou" };
  }
}
