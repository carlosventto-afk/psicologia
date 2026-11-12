// Entrega da NFS-e autorizada ao tomador (e-mail e WhatsApp).
//
// Contrato: entregarNota NUNCA lança. Cada canal é independente (falha de um não
// impede o outro) e idempotente (enviada_*_em já preenchido nunca reenvia).
// Só entrega em ambiente de produção; homologação fica "pulado".
// Cada canal é reivindicado (claim) ANTES do envio por update condicional em
// enviada_<canal>_em IS NULL: no máximo um envio por canal, mesmo com chamadas
// concorrentes (gatilho automático, botão manual, reprocessador).

import { enviarEmailNotaFiscal } from "./email.js";
import { enviarWhatsapp, enviarDocumentoWhatsApp } from "./whatsapp.js";
import {
  canaisDeEntrega,
  montarMensagemWhatsappNota,
  normalizarTelefoneWhatsapp,
} from "./nota-fiscal.js";

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

const COLUNA = { email: "enviada_email_em", whatsapp: "enviada_whatsapp_em" };

// Reivindica o canal. "ok" = este chamador é o dono; "perdeu" = outro já reivindicou
// (ou enviou); "erro" = falha de escrita (fail closed: não envia).
async function reivindicar(supabase, notaId, canal) {
  const { data, error } = await supabase
    .from("NotaFiscal")
    .update({ [COLUNA[canal]]: new Date().toISOString() })
    .eq("id", notaId)
    .is(COLUNA[canal], null)
    .select("id");
  if (error) return { estado: "erro", erro: error };
  return { estado: Array.isArray(data) && data.length > 0 ? "ok" : "perdeu" };
}

// Devolve a reivindicação após falha de envio, para permitir nova tentativa.
async function liberar(supabase, notaId, canal) {
  try {
    const { data, error } = await supabase
      .from("NotaFiscal")
      .update({ [COLUNA[canal]]: null })
      .eq("id", notaId)
      .select("id");
    if (error || !data?.length) {
      console.error(`[nfse-entrega] não liberou a reivindicação de ${canal} (nota ${notaId})`);
    }
  } catch {
    console.error(`[nfse-entrega] não liberou a reivindicação de ${canal} (nota ${notaId})`);
  }
}

export async function entregarNota(supabase, notaId, injetados = {}) {
  const enviarEmail = injetados.enviarEmail ?? enviarEmailNotaFiscal;
  const enviarDocumento = injetados.enviarDocumento ?? enviarDocumentoWhatsApp;
  const enviarTexto = injetados.enviarTexto ?? enviarWhatsapp;

  try {
    const { data: nota, error: erroNota } = await supabase
      .from("NotaFiscal")
      .select(
        "id, owner, status, ambiente, cobranca, recebimento_sessao, chave_acesso, xml_nfse, pdf_base64, tomador_nome, tomador_email, tomador_telefone, enviada_email_em, enviada_whatsapp_em",
      )
      .eq("id", notaId)
      .maybeSingle();
    if (erroNota) {
      console.error(`[nfse-entrega] não carregou a nota ${notaId}: ${erroNota.message}`);
      return { ...PULADO };
    }
    if (!nota || nota.status !== "autorizada") return { ...PULADO };

    const pacienteId = await buscarPacienteId(supabase, nota);
    const [usuarioRes, pacienteRes] = await Promise.all([
      supabase.from("Usuarios").select("nome").eq("id_user", nota.owner).maybeSingle(),
      pacienteId
        ? supabase.from("Paciente").select("whatsapp_lembrete_opt_in").eq("id", pacienteId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    for (const r of [usuarioRes, pacienteRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const canais = canaisDeEntrega({
      // Ambiente da própria nota: homologação nunca vai ao paciente, mesmo que o
      // profissional já tenha mudado para produção.
      ambiente: nota.ambiente,
      tomador: { email: nota.tomador_email, telefone: nota.tomador_telefone },
      optInWhatsapp: pacienteRes.data?.whatsapp_lembrete_opt_in === true,
      jaEnviadoEmail: Boolean(nota.enviada_email_em),
      jaEnviadoWhatsapp: Boolean(nota.enviada_whatsapp_em),
    });

    const resultado = { ...PULADO };
    const erros = [];

    // Reivindica, envia e, se falhar, libera. Devolve o estado do canal.
    const entregar = async (canal, rotulo, enviar) => {
      const claim = await reivindicar(supabase, nota.id, canal);
      if (claim.estado === "perdeu") return "pulado";
      if (claim.estado === "erro") {
        erros.push(`${rotulo}: não foi possível reservar o envio (${claim.erro?.message ?? claim.erro})`);
        return "falhou";
      }
      try {
        await enviar();
        return "enviado";
      } catch (erro) {
        erros.push(`${rotulo}: ${erro?.message ?? erro}`);
        await liberar(supabase, nota.id, canal);
        return "falhou";
      }
    };

    if (canais.email) {
      resultado.email = await entregar("email", "e-mail", async () => {
        if (!String(nota.xml_nfse ?? "").trim()) throw new Error("XML da nota ausente");
        // xml_nfse guarda o texto decodificado; o e-mail espera base64.
        const xmlBase64 = Buffer.from(nota.xml_nfse, "utf8").toString("base64");
        await enviarEmail({
          paraEmail: String(nota.tomador_email).trim(),
          pacienteNome: nota.tomador_nome ?? "",
          xmlBase64,
          pdfBase64: nota.pdf_base64 || undefined,
        });
      });
    }

    if (canais.whatsapp) {
      resultado.whatsapp = await entregar("whatsapp", "WhatsApp", async () => {
        const numero = normalizarTelefoneWhatsapp(nota.tomador_telefone);
        if (!numero) throw new Error("telefone do tomador inválido");
        const mensagem = montarMensagemWhatsappNota({
          nomeProfissional: usuarioRes.data?.nome ?? "seu profissional",
          chave: nota.chave_acesso,
        });
        const { error } = nota.pdf_base64
          ? await enviarDocumento({
              numero,
              base64: nota.pdf_base64,
              nomeArquivo: "nota-fiscal.pdf",
              legenda: mensagem,
            })
          : await enviarTexto({ numero, mensagem });
        if (error) throw error;
      });
    }

    // ultimo_erro: grava quando algum canal falhou; limpa quando tudo o que foi
    // tentado teve sucesso.
    const tentados = [resultado.email, resultado.whatsapp].filter((r) => r !== "pulado");
    if (erros.length > 0 || (tentados.length > 0 && tentados.every((r) => r === "enviado"))) {
      const ultimo_erro = erros.length > 0 ? `Falha na entrega (${erros.join("; ")})` : null;
      const { data, error } = await supabase
        .from("NotaFiscal")
        .update({ ultimo_erro })
        .eq("id", nota.id)
        .select("id");
      if (error || !data?.length) {
        console.error(`[nfse-entrega] ultimo_erro não gravado (nota ${nota.id})`);
      }
    }

    return resultado;
  } catch (erro) {
    console.error(`[nfse-entrega] erro inesperado (nota ${notaId}): ${erro?.message ?? erro}`);
    return { email: "falhou", whatsapp: "falhou" };
  }
}
