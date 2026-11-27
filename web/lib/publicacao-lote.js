// Publicação de artigos em lote (tela /admin/artigos). Sem imports do Next nem
// do alias "@/": o cliente do banco entra por parâmetro, para rodar sob
// `node --test` e em scripts de verificação.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Os ids vêm do navegador, então são entrada não confiável: só UUID passa e
// repetido some. O resto nem chega ao filtro `.in()` do PostgREST.
export function normalizarIdsDoLote(ids) {
  if (!Array.isArray(ids)) return [];
  const vistos = new Set();
  for (const id of ids) {
    if (typeof id === "string" && UUID.test(id)) vistos.add(id.toLowerCase());
  }
  return [...vistos];
}

export function emPartes(lista, tamanho) {
  const partes = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    partes.push(lista.slice(i, i + tamanho));
  }
  return partes;
}

// Intervalo entre as datas de publicação de um mesmo lote. O blog ordena por
// publicado_em e desempata pelo id (aleatório): sem esse espaçamento, um lote
// inteiro sairia embaralhado. 1 s porque o feed RSS só tem precisão de segundo.
const PASSO_MS = 1000;

// Decide a data de publicação de cada rascunho do lote. O mais antigo (criado_em)
// recebe a data mais antiga e o mais novo recebe `agora`, então no blog o mais
// novo fica no topo e nenhuma data passa de `agora`. Quem já foi publicado antes
// e voltou a rascunho mantém a data original, como no formulário de edição.
export function planejarPublicacao(rascunhos, agora) {
  const ordenados = [...rascunhos].sort((a, b) => {
    const porCriacao = Date.parse(a.criado_em) - Date.parse(b.criado_em);
    return porCriacao || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const ultimo = ordenados.length - 1;

  return ordenados.map((r, i) => ({
    id: r.id,
    titulo: r.titulo,
    slug: r.slug,
    publicado_em: r.publicado_em ?? new Date(agora.getTime() - (ultimo - i) * PASSO_MS).toISOString(),
  }));
}

function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

// Texto para a tela: `sucesso` (verde), `aviso` (amarelo) e `error` (vermelho).
// Só entram as chaves que se aplicam.
export function resumirLote({ publicados, falhas, ignorados }) {
  const resumo = {};

  if (publicados.length > 0) {
    resumo.sucesso = `${plural(publicados.length, "artigo publicado", "artigos publicados")}.`;
  }

  if (falhas.length > 0) {
    const titulos = falhas.slice(0, 3).map((f) => `“${f.titulo}”`).join(", ");
    const resto = falhas.length - 3;
    const frase = plural(falhas.length, "artigo não foi publicado", "artigos não foram publicados");
    resumo.error = `${frase}: ${titulos}${resto > 0 ? ` e mais ${resto}` : ""}.`;
  }

  if (ignorados > 0) {
    resumo.aviso =
      ignorados === 1
        ? "1 artigo já estava publicado ou não existe mais, e foi ignorado."
        : `${ignorados} artigos já estavam publicados ou não existem mais, e foram ignorados.`;
  }

  return resumo;
}

// Cada id ocupa ~39 caracteres na URL do PostgREST (UUID + vírgula codificada):
// 50 por consulta fica longe do limite de ~8 KB do gateway.
const IDS_POR_CONSULTA = 50;
// Gravações em andamento ao mesmo tempo.
const ATUALIZACOES_SIMULTANEAS = 10;

// Publica os rascunhos do lote e diz o que aconteceu com cada um. `supabase` é
// o cliente da sessão de quem pediu (o RLS decide quem pode); `agora` entra por
// parâmetro para os testes.
//
// - Só mexe em quem ainda é rascunho. O resto (já publicado, apagado, invisível
//   para o RLS) volta em `ignorados`.
// - Grava um artigo por vez, cada um com a sua data, e confirma pela linha que
//   o banco devolve: o RLS não dá erro, só não enxerga a linha, então "sem erro"
//   não basta para dizer que publicou.
// - Erro ao ler interrompe tudo (lança). Erro ao gravar marca só aquele artigo
//   em `falhas`, e os demais seguem.
export async function publicarRascunhos(supabase, ids, agora = new Date()) {
  const idsValidos = normalizarIdsDoLote(ids);

  const rascunhos = [];
  for (const parte of emPartes(idsValidos, IDS_POR_CONSULTA)) {
    const { data, error } = await supabase
      .from("artigos")
      .select("id, titulo, slug, publicado_em, criado_em")
      .in("id", parte)
      .eq("publicado", false);
    if (error) throw new Error(error.message);
    rascunhos.push(...data);
  }

  const plano = planejarPublicacao(rascunhos, agora);
  const atualizadoEm = agora.toISOString();
  const publicados = [];
  const falhas = [];

  for (const parte of emPartes(plano, ATUALIZACOES_SIMULTANEAS)) {
    const deramCerto = await Promise.all(
      parte.map(async (item) => {
        try {
          const { data, error } = await supabase
            .from("artigos")
            .update({ publicado: true, publicado_em: item.publicado_em, atualizado_em: atualizadoEm })
            .eq("id", item.id)
            .eq("publicado", false)
            .select("id");
          return !error && data?.length === 1;
        } catch {
          return false;
        }
      })
    );
    parte.forEach((item, i) => (deramCerto[i] ? publicados : falhas).push(item));
  }

  return { publicados, falhas, ignorados: idsValidos.length - rascunhos.length };
}
