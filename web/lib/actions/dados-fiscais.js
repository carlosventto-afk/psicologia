"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chamarServicoNfse } from "@/lib/nfse-client";

function dadosDoFormulario(formData) {
  return {
    tipo_documento: formData.get("tipo_documento"),
    documento: formData.get("documento"),
    inscricao_municipal: formData.get("inscricao_municipal") || null,
    nome_empresarial: formData.get("nome_empresarial"),
    email_nfse: formData.get("email_nfse"),
    telefone_nfse: formData.get("telefone_nfse") || null,
    logradouro: formData.get("logradouro"),
    numero: formData.get("numero"),
    complemento: formData.get("complemento") || null,
    bairro: formData.get("bairro"),
    municipio_ibge: formData.get("municipio_ibge"),
    uf: formData.get("uf"),
    cep: formData.get("cep"),
    optante_simples_nacional: Number(formData.get("optante_simples_nacional")),
    regime_apuracao_sn: formData.get("regime_apuracao_sn") ? Number(formData.get("regime_apuracao_sn")) : null,
    codigo_tributacao_nacional: formData.get("codigo_tributacao_nacional"),
  };
}

export async function salvarDadosFiscais(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const dados = dadosDoFormulario(formData);

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .upsert({ owner: user.id, ...dados }, { onConflict: "owner" });

  if (error) return { error: "Não foi possível salvar os dados fiscais: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}

export async function enviarCertificado(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const arquivo = formData.get("certificado");
  const senha = formData.get("senha_certificado");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione o arquivo .pfx do certificado." };
  }

  const { data: fiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("documento")
    .eq("owner", user.id)
    .maybeSingle();

  if (!fiscal) {
    return { error: "Preencha e salve os dados fiscais antes de enviar o certificado." };
  }

  const pfxBase64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

  let resultado;
  try {
    resultado = await chamarServicoNfse("/certificado/validar", {
      pfx_base64: pfxBase64,
      senha,
      documento_esperado: fiscal.documento,
    });
  } catch (erro) {
    return { error: erro.message };
  }

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({
      certificado_pfx_cifrado: resultado.pfx_cifrado,
      certificado_senha_cifrada: resultado.senha_cifrada,
      certificado_titular: resultado.titular,
      certificado_validade: resultado.valido_ate,
    })
    .eq("owner", user.id);

  if (error) return { error: "Certificado validado, mas não foi possível salvar: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true, avisoTitularidade: resultado.alerta_titularidade };
}

export async function trocarParaProducao(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({ ambiente: "producao" })
    .eq("owner", user.id)
    .eq("ambiente", "homologacao");

  if (error) return { error: "Não foi possível trocar de ambiente: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}
