import { createClient } from "@/lib/supabase/server";
import { gerarPdfsDasNotas } from "@/lib/nfse-pdf";
import { rebuscarDocumentos } from "@/lib/nfse-rebusca";
import {
  CONTENT_TYPE,
  LIMITE_NOTAS_EM_BLOCO,
  bytesDoDocumento,
  contentDispositionAnexo,
  contextoDoNomeArquivo,
  documentosFaltantes,
  extensoesDoFormato,
  montarZip,
  nomeArquivoNota,
  nomesUnicos,
  normalizarIdsNotas,
  notaTemDocumento,
} from "@/lib/nfse-documentos";

// Download do PDF (DANFSe) e/ou XML da NFS-e.
//   GET ?id=12&formato=pdf|xml          -> o arquivo (uma nota)
//   GET ?id=12&formato=todos            -> .zip com PDF + XML da nota
//   GET ?id=1&id=2&...&formato=...      -> .zip com os arquivos das notas (em bloco)
// Autenticado pela sessão; a RLS de NotaFiscal só devolve notas do dono (ou admin).
// O PDF é desenhado na hora pelo nfse-service a partir do XML guardado: o layout é sempre o
// atual e vale para qualquer nota que o usuário enxerga. O PDF guardado (pdf_base64) só entra
// se o serviço não responder. Uma nota só e sem XML guardado (raro): busca de novo na SEFIN
// e guarda (só o dono, pois usa o certificado). Em bloco não busca na SEFIN: lista o que
// faltou no LEIA-ME.txt.
// Os arquivos se chamam "Responsável - Paciente - pg <data do pagamento> at <mês ano> - NFSe-série-número"
// (ver nomeArquivoNota); nota sem esses vínculos sai com o nome curto NFSe-série-número.

const TEXTO = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" };
const resposta = (status, mensagem) => new Response(mensagem, { status, headers: TEXTO });

const COLUNAS = "id, owner, status, ambiente, serie, numero, chave_acesso, xml_nfse, pdf_base64";
// O nome do arquivo usa o tomador, o pagamento da cobrança e as sessões atendidas. Se este select com
// vínculos falhar, o download não pode quebrar por causa do nome: repete só com as colunas da nota.
const COLUNAS_COM_NOME =
  `${COLUNAS}, tomador_nome, tomador_documento, ` +
  "Cobranca(Recebimento(data_recebimento, RecebimentoSessao(Sessao(data, Paciente(id, nome))))), " +
  "RecebimentoSessao(Recebimento(data_recebimento), Sessao(data, Paciente(id, nome)))";

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

  let { data, error } = await supabase.from("NotaFiscal").select(COLUNAS_COM_NOME).in("id", ids);
  if (error) {
    console.error(`NFS-e: select com vínculos falhou no download (${error.message}); seguindo só com as colunas da nota.`);
    ({ data, error } = await supabase.from("NotaFiscal").select(COLUNAS).in("id", ids));
  }
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

  // PDF desenhado na hora a partir do XML; se o serviço falhar, cai no PDF guardado.
  const geradas = extensoes.includes("pdf") ? await gerarPdfsDasNotas(notas) : new Map();

  const nomeDe = (nota, ext) => nomeArquivoNota(nota, ext, contextoDoNomeArquivo(nota));

  const arquivos = [];
  const ausentes = [];
  for (const nota of notas) {
    for (const ext of extensoes) {
      const pdfGerado = ext === "pdf" ? (geradas.get(String(nota.id)) ?? null) : null;
      const conteudo = bytesDoDocumento(nota, ext, pdfGerado);
      if (conteudo) arquivos.push({ nome: nomeDe(nota, ext), conteudo, ext, origem: pdfGerado ? "gerado" : "guardado" });
      else ausentes.push(nomeDe(nota, ext));
    }
  }

  if (arquivos.length === 0) {
    return resposta(
      503,
      "Não foi possível gerar o documento agora. Tente novamente em alguns minutos."
    );
  }

  const cabecalhos = { "Cache-Control": "private, no-store" };

  if (unica && extensoes.length === 1) {
    const a = arquivos[0];
    return new Response(a.conteudo, {
      headers: {
        ...cabecalhos,
        "Content-Type": CONTENT_TYPE[a.ext],
        "Content-Disposition": contentDispositionAnexo(a.nome),
        // De onde veio o PDF (gerado agora ou o guardado de reserva): ajuda a diagnosticar.
        ...(a.ext === "pdf" ? { "X-Nfse-Pdf-Origem": a.origem } : {}),
      },
    });
  }

  const nomesNoZip = nomesUnicos(arquivos.map((a) => a.nome));
  const zipados = arquivos.map(({ conteudo }, i) => ({ nome: nomesNoZip[i], conteudo }));
  if (ausentes.length > 0) {
    const linhas = [
      "Estes arquivos não estavam disponíveis e ficaram de fora deste pacote:",
      ...ausentes.map((n) => `- ${n}`),
      "",
      "Baixe cada nota individualmente em Notas Fiscais; se continuar sem o documento, tente de novo em alguns minutos.",
    ];
    zipados.push({ nome: "LEIA-ME.txt", conteudo: Buffer.from(linhas.join("\n"), "utf-8") });
  }

  const nomeZip = unica ? nomeDe(notas[0], "zip") : `notas-fiscais-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(montarZip(zipados), {
    headers: {
      ...cabecalhos,
      "Content-Type": "application/zip",
      "Content-Disposition": contentDispositionAnexo(nomeZip),
    },
  });
}
