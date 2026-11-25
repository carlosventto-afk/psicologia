import { chamarServicoNfse } from "./nfse-client.js";

// Re-busca XML/PDF de uma nota autorizada no portal nacional (via nfse-service) e grava
// o que veio. Usada pelo download (cliente do usuário) e pelo job de reprocessamento
// (cliente admin). Nunca lança: devolve a nota (atualizada se algo veio).
// faltantes = { xml: boolean, pdf: boolean }
export async function rebuscarDocumentos(supabase, nota, faltantes) {
  const { data: fiscal } = await supabase
    .from("DadosFiscaisProfissional")
    .select("certificado_pfx_cifrado, certificado_senha_cifrada")
    .eq("owner", nota.owner)
    .maybeSingle();
  if (!fiscal) return nota;

  let doc;
  try {
    doc = await chamarServicoNfse("/documentos-nfse", {
      ambiente: nota.ambiente,
      certificado_pfx_cifrado: fiscal.certificado_pfx_cifrado,
      certificado_senha_cifrada: fiscal.certificado_senha_cifrada,
      chave_acesso: nota.chave_acesso,
      buscar_xml: faltantes.xml,
      buscar_pdf: faltantes.pdf,
    });
  } catch (e) {
    console.error(`NFS-e: re-busca de documentos falhou (nota ${nota.id}): ${e?.message ?? e}`);
    return nota;
  }

  const colunas = {};
  if (faltantes.xml && doc?.xml_nfse_base64) colunas.xml_nfse = Buffer.from(doc.xml_nfse_base64, "base64").toString("utf-8");
  if (faltantes.pdf && doc?.pdf_base64) colunas.pdf_base64 = doc.pdf_base64;
  if (Object.keys(colunas).length === 0) return nota;

  const { error } = await supabase.from("NotaFiscal").update(colunas).eq("id", nota.id);
  if (error) console.error(`NFS-e: não gravou documentos re-buscados (nota ${nota.id}): ${error.message}`);
  return { ...nota, ...colunas };
}
