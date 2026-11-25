import { chamarServicoNfse } from "./nfse-client.js";

// O PDF da NFS-e (DANFSe) e funcao pura do XML autorizado: o nfse-service o desenha na hora,
// sem certificado nem SEFIN. Assim um ajuste de layout vale para todas as notas, sem regerar
// o que ficou guardado em NotaFiscal.pdf_base64 (que serve so de reserva e de anexo na entrega).

export const LOTE_MAX_PDFS = 100; // mesmo limite do endpoint /danfse
const BASE_MS = 8000;
const POR_NOTA_MS = 400; // ~40 ms para desenhar, com folga para a rede

const temTexto = (v) => String(v ?? "").trim() !== "";

// notas: [{ id, ambiente, xml_nfse }] -> Map(String(id) -> Buffer do PDF).
// Fora do mapa ficam as notas sem XML e as que o servico nao conseguiu desenhar. Nunca lança:
// servico fora do ar, lento ou nao configurado so significa "sem PDF novo" (o chamador cai no guardado).
export async function gerarPdfsDasNotas(notas, chamar = chamarServicoNfse) {
  const geradas = new Map();
  const candidatas = (notas ?? []).filter((n) => n && temTexto(n.xml_nfse));

  for (let i = 0; i < candidatas.length; i += LOTE_MAX_PDFS) {
    const lote = candidatas.slice(i, i + LOTE_MAX_PDFS);
    try {
      const resposta = await chamar(
        "/danfse",
        {
          notas: lote.map((n) => ({
            id: String(n.id),
            ambiente: n.ambiente,
            xml_nfse_base64: Buffer.from(n.xml_nfse, "utf-8").toString("base64"),
          })),
        },
        { timeoutMs: BASE_MS + POR_NOTA_MS * lote.length },
      );
      for (const r of resposta?.resultados ?? []) {
        if (r?.pdf_base64) geradas.set(String(r.id), Buffer.from(r.pdf_base64, "base64"));
      }
    } catch (e) {
      console.error(`NFS-e: não desenhou o PDF de ${lote.length} nota(s): ${e?.message ?? e}`);
    }
  }
  return geradas;
}
