"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chamarServicoNfse } from "@/lib/nfse-client";
import { enviarEmailNotaFiscal } from "@/lib/email";

export async function emitirNotaFiscal(pagamentoId, prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { data: pagamento, error: erroPagamento } = await supabase
    .from("PagamentoSessao")
    .select("id, valor, Sessao!inner(id, data, Paciente!inner(id, nome, email, cpf, documento))")
    .eq("id", pagamentoId)
    .single();

  if (erroPagamento || !pagamento) return { error: "Pagamento não encontrado." };
  if (pagamento.Sessao.Paciente.documento !== "nota_fiscal") {
    return { error: "Paciente não está marcado para Nota Fiscal." };
  }
  if (!pagamento.Sessao.Paciente.cpf) {
    return { error: "Paciente sem CPF cadastrado — obrigatório para a nota." };
  }

  const { data: fiscal, error: erroFiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("*")
    .eq("owner", user.id)
    .maybeSingle();

  if (erroFiscal || !fiscal) {
    return { error: "Configure seus dados fiscais em Configurações → NFS-e antes de emitir." };
  }
  if (!fiscal.certificado_pfx_cifrado) {
    return { error: "Envie seu certificado digital em Configurações → NFS-e antes de emitir." };
  }
  if (fiscal.certificado_validade && new Date(fiscal.certificado_validade) < new Date()) {
    return { error: "Certificado digital vencido. Envie um novo antes de emitir." };
  }

  const { data: registro, error: erroRegistro } = await supabase.rpc("registrar_nota_fiscal_pendente", {
    p_pagamento_sessao: pagamento.id,
  });

  if (erroRegistro || !registro?.[0]) {
    return { error: "Não foi possível reservar o número da nota: " + (erroRegistro?.message ?? "erro desconhecido") };
  }

  const { id: notaId, numero, serie, ambiente } = registro[0];

  let resultado;
  try {
    resultado = await chamarServicoNfse("/emitir", {
      ambiente,
      certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
      certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
      serie,
      numero,
      competencia: pagamento.Sessao.data,
      prestador: {
        documento: fiscal.documento,
        inscricao_municipal: fiscal.inscricao_municipal,
        municipio_ibge: fiscal.municipio_ibge,
        optante_simples_nacional: fiscal.optante_simples_nacional,
        regime_apuracao_sn: fiscal.regime_apuracao_sn,
        codigo_tributacao_nacional: fiscal.codigo_tributacao_nacional,
        codigo_tributacao_municipal: fiscal.codigo_tributacao_municipal,
      },
      tomador: {
        documento: pagamento.Sessao.Paciente.cpf,
        nome: pagamento.Sessao.Paciente.nome,
        email: pagamento.Sessao.Paciente.email || null,
      },
      descricao_servico: `Sessao de psicologia - ${pagamento.Sessao.data}`,
      valor: Number(pagamento.valor),
    });
  } catch (erro) {
    await supabase
      .from("NotaFiscal")
      .update({
        status: "rejeitada",
        erros: [
          {
            codigo: "?",
            titulo: "Falha ao chamar o serviço de emissão",
            explicacao: erro.message,
            acao_sugerida: "Tente novamente em instantes.",
          },
        ],
      })
      .eq("id", notaId);
    revalidatePath("/notas-fiscais");
    return { error: "Falha ao emitir: " + erro.message };
  }

  await supabase
    .from("NotaFiscal")
    .update({
      dps_id: resultado.dps_id,
      xml_dps: Buffer.from(resultado.xml_dps_base64, "base64").toString("utf-8"),
      status: resultado.autorizada ? "autorizada" : "rejeitada",
      chave_acesso: resultado.chave_acesso ?? null,
      xml_nfse: resultado.xml_nfse_base64
        ? Buffer.from(resultado.xml_nfse_base64, "base64").toString("utf-8")
        : null,
      erros: resultado.erros?.length ? resultado.erros : null,
    })
    .eq("id", notaId);

  let avisoEmail;
  if (resultado.autorizada && pagamento.Sessao.Paciente.email) {
    try {
      await enviarEmailNotaFiscal({
        paraEmail: pagamento.Sessao.Paciente.email,
        pacienteNome: pagamento.Sessao.Paciente.nome,
        xmlBase64: resultado.xml_nfse_base64,
        pdfBase64: resultado.pdf_base64 ?? null,
      });
    } catch (erroEmail) {
      // Nota ja autorizada e persistida -- falha no e-mail nao pode
      // reverter isso nem esconder o sucesso da emissao do operador.
      // Avisamos o operador (avisoEmail) em vez de engolir o erro: a
      // chave de acesso continua disponivel na lista de notas emitidas.
      avisoEmail =
        "A nota foi emitida mas o e-mail para o paciente falhou: " +
        erroEmail.message +
        ". A chave de acesso está disponível na lista de notas emitidas.";
    }
  }

  revalidatePath("/notas-fiscais");
  return resultado.autorizada
    ? { sucesso: true, avisoEmail }
    : { error: "Nota rejeitada: " + (resultado.erros?.[0]?.titulo ?? "erro desconhecido") };
}

export async function cancelarNotaFiscal(notaId, motivoTexto, prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { data: nota, error: erroNota } = await supabase
    .from("NotaFiscal")
    .select("id, status, chave_acesso, ambiente")
    .eq("id", notaId)
    .single();

  if (erroNota || !nota) return { error: "Nota não encontrada." };
  if (nota.status !== "autorizada") return { error: "Só é possível cancelar notas autorizadas." };

  const { data: fiscal, error: erroFiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("documento, certificado_pfx_cifrado, certificado_senha_cifrada")
    .eq("owner", user.id)
    .single();

  if (erroFiscal || !fiscal) return { error: "Dados fiscais não encontrados." };

  let resultado;
  try {
    resultado = await chamarServicoNfse("/cancelar", {
      ambiente: nota.ambiente,
      certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
      certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
      chave_acesso: nota.chave_acesso,
      autor_documento: fiscal.documento,
      motivo_texto: motivoTexto || "Cancelamento solicitado pelo prestador",
    });
  } catch (erro) {
    return { error: "Falha ao cancelar: " + erro.message };
  }

  if (!resultado.registrado) {
    return { error: "Cancelamento rejeitado: " + (resultado.erros?.[0]?.titulo ?? "erro desconhecido") };
  }

  await supabase.from("NotaFiscal").update({ status: "cancelada" }).eq("id", notaId);

  revalidatePath("/notas-fiscais");
  return { sucesso: true };
}
