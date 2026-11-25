import { createClient } from "@/lib/supabase/server";
import { rebuscarDocumentos } from "@/lib/nfse-rebusca";
import {
  CONTENT_TYPE,
  LIMITE_NOTAS_EM_BLOCO,
  bytesDoDocumento,
  documentosFaltantes,
  extensoesDoFormato,
  montarZip,
  nomeArquivoNota,
  normalizarIdsNotas,
  notaTemDocumento,
} from "@/lib/nfse-documentos";

// Download do PDF (DANFSe oficial) e/ou XML da NFS-e.
//   GET ?id=12&formato=pdf|xml          -> o arquivo (uma nota)
//   GET ?id=12&formato=todos            -> .zip com PDF + XML da nota
//   GET ?id=1&id=2&...&formato=...      -> .zip com os arquivos das notas (em bloco)
// Autenticado pela sessão; a RLS de NotaFiscal só devolve notas do dono (ou admin).
// Uma nota só: se faltar o documento (ADN instável na emissão), busca de novo no
// nfse-service e guarda. Em bloco não re-busca (lento): lista o que faltou no LEIA-ME.txt.

const TEXTO = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" };
const resposta = (status, mensagem) => new Response(mensagem, { status, headers: TEXTO });

const COLUNAS = "id, owner, status, ambiente, serie, numero, chave_acesso, xml_nfse, pdf_base64";

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const extensoes = extensoesDoFormato(params.get("formato"));
  if (!extensoes) return resposta(400, "Formato inválido. Use pdf, xml ou todos.");

  const ids = normalizarIdsNotas([...params.getAll("id"), ...normalizarIdsNotas(params.get("ids"))]);
  if (ids.length === 0) return resposta(400, "Nenhuma nota informada.");
  if (ids.length > LIMITE_NOTAS_EM_BLOCO) {
    return resposta(400, `Selecione no máximo ${LIMITE_NOTAS_EM_BLOCO} notas por download.`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return resposta(401, "Não autorizado.");

  const { data, error } = await supabase.from("NotaFiscal").select(COLUNAS).in("id", ids);
  if (error) {
    console.error(`NFS-e: falha ao listar notas para download: ${error.message}`);
    return resposta(500, "Não foi possível carregar as notas agora.");
  }

  // Mantém a ordem pedida; ignora notas que a RLS escondeu ou que não têm documento.
  const porId = new Map((data ?? []).map((n) => [Number(n.id), n]));
  let notas = ids.map((id) => porId.get(id)).filter(notaTemDocumento);
  if (notas.length === 0) return resposta(404, "Nota não encontrada ou ainda sem documento (só notas autorizadas).");

  const unica = notas.length === 1;
  if (unica) {
    const faltantes = documentosFaltantes(notas[0], extensoes);
    if ((faltantes.xml || faltantes.pdf) && notas[0].owner === user.id) {
      notas = [await rebuscarDocumentos(supabase, notas[0], faltantes)];
    }
  }

  const arquivos = [];
  const ausentes = [];
  for (const nota of notas) {
    for (const ext of extensoes) {
      const conteudo = bytesDoDocumento(nota, ext);
      if (conteudo) arquivos.push({ nome: nomeArquivoNota(nota, ext), conteudo, ext });
      else ausentes.push(nomeArquivoNota(nota, ext));
    }
  }

  if (arquivos.length === 0) {
    return resposta(
      503,
      "O documento ainda não está disponível no portal nacional da NFS-e (o serviço do governo oscila). Tente novamente em alguns minutos."
    );
  }

  const cabecalhos = { "Cache-Control": "private, no-store" };

  if (unica && extensoes.length === 1) {
    const a = arquivos[0];
    return new Response(a.conteudo, {
      headers: {
        ...cabecalhos,
        "Content-Type": CONTENT_TYPE[a.ext],
        "Content-Disposition": `attachment; filename="${a.nome}"`,
      },
    });
  }

  const zipados = arquivos.map(({ nome, conteudo }) => ({ nome, conteudo }));
  if (ausentes.length > 0) {
    const linhas = [
      "Estes arquivos não estavam disponíveis e ficaram de fora deste pacote:",
      ...ausentes.map((n) => `- ${n}`),
      "",
      "Baixe cada nota individualmente em Notas Fiscais: o sistema tenta buscar o documento de novo no portal nacional.",
    ];
    zipados.push({ nome: "LEIA-ME.txt", conteudo: Buffer.from(linhas.join("\n"), "utf-8") });
  }

  const nomeZip = unica ? nomeArquivoNota(notas[0], "zip") : `notas-fiscais-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(montarZip(zipados), {
    headers: {
      ...cabecalhos,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeZip}"`,
    },
  });
}
