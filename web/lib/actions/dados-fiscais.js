"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chamarServicoNfse } from "@/lib/nfse-client";
import { validarAtivacaoEmissaoAutomatica, validarOrigemCompetencia } from "@/lib/nota-fiscal";
import { hojeSaoPaulo } from "@/lib/cobranca";

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
    codigo_tributacao_municipal: formData.get("codigo_tributacao_municipal") || null,
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

// Liga/desliga a emissao automatica ao receber cobranca. Ligar exige dados fiscais,
// certificado e CRP; desligar e sempre permitido. Falhas esperadas sao RETORNADAS.
export async function alterarEmissaoAutomatica(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const ativar = formData.get("emissao_automatica") === "on";

  if (ativar) {
    const [fiscalRes, usuarioRes] = await Promise.all([
      supabase
        .from("DadosFiscaisProfissional")
        .select("certificado_pfx_cifrado, certificado_validade")
        .eq("owner", user.id)
        .maybeSingle(),
      supabase.from("Usuarios").select("crp").eq("id_user", user.id).maybeSingle(),
    ]);
    if (fiscalRes.error || usuarioRes.error) {
      return { error: "Não foi possível verificar os pré-requisitos. Tente novamente." };
    }
    const validacao = validarAtivacaoEmissaoAutomatica({ fiscal: fiscalRes.data, usuario: usuarioRes.data, hoje: hojeSaoPaulo() });
    if (!validacao.ok) return { error: validacao.motivo };
  }

  const { error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({ emissao_automatica: ativar })
    .eq("owner", user.id);

  if (error) return { error: "Não foi possível salvar a configuração: " + error.message };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}

// Define de onde sai a competência das próximas notas: data dos atendimentos (padrão) ou data
// do pagamento informada na cobrança. Não altera notas já emitidas.
export async function alterarCompetenciaNota(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado." };

  const escolha = validarOrigemCompetencia(formData.get("competencia_origem"));
  if (!escolha.ok) return { error: escolha.motivo };

  const { data, error } = await supabase
    .from("DadosFiscaisProfissional")
    .update({ competencia_origem: escolha.origem })
    .eq("owner", user.id)
    .select("owner");

  if (error) return { error: "Não foi possível salvar a configuração: " + error.message };
  if (!data?.length) return { error: "Salve os dados fiscais antes de escolher a competência da nota." };

  revalidatePath("/configuracoes/nfse");
  return { sucesso: true };
}
