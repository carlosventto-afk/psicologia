"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
