// Ponte com o microservico Python de NFS-e -- ver
// docs/superpowers/specs/2026-08-14-nfse-emissao-design.md. Nunca lida com
// o certificado em texto puro: so repassa os blobs ja cifrados que o
// microservico devolveu no upload.
export async function chamarServicoNfse(caminho, corpo) {
  const url = process.env.NFSE_SERVICE_URL;
  const segredo = process.env.NFSE_SERVICE_SECRET;
  if (!url || !segredo) {
    throw new Error("Servico de NFS-e nao configurado (NFSE_SERVICE_URL/NFSE_SERVICE_SECRET ausentes).");
  }

  const resposta = await fetch(`${url}${caminho}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nfse-Secret": segredo,
    },
    body: JSON.stringify(corpo),
  });

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(dados?.detail || `Servico de NFS-e respondeu ${resposta.status}.`);
  }

  return dados;
}
