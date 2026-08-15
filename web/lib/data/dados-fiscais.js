import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarDadosFiscais() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("DadosFiscaisProfissional")
    .select(
      "id, owner, tipo_documento, documento, inscricao_municipal, nome_empresarial, email_nfse, telefone_nfse, " +
        "logradouro, numero, complemento, bairro, municipio_ibge, uf, cep, optante_simples_nacional, " +
        "regime_apuracao_sn, codigo_tributacao_nacional, codigo_tributacao_municipal, certificado_titular, certificado_validade, ambiente, " +
        "serie, proximo_numero, created_at"
    )
    .eq("owner", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizarIds(data, ["id"]) : null;
}
