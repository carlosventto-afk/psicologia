// Regras puras do blog público (paginação e "leia também"). Sem imports do
// Next nem do banco, para poder ser testado com `node --test`.

export const POR_PAGINA = 12;

// `paginaParam` vem da URL (?pagina=2). Só vale o inteiro positivo em forma
// canônica ("2", não "02" nem "2.0"), dentro do total de páginas: qualquer
// outra coisa é inválida e o chamador responde 404, em vez de servir a mesma
// lista numa URL diferente (conteúdo duplicado). `inicio`/`fim` são índices
// base 0 inclusivos, no formato do `.range()` do Supabase.
export function paginar(total, paginaParam, porPagina = POR_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  let pagina = 1;
  let valida = true;

  if (paginaParam !== undefined && paginaParam !== null) {
    const texto = String(paginaParam);
    if (/^[1-9]\d*$/.test(texto)) {
      pagina = Number(texto);
    } else {
      valida = false;
    }
  }
  if (pagina > totalPaginas) valida = false;

  return {
    pagina,
    totalPaginas,
    inicio: (pagina - 1) * porPagina,
    fim: pagina * porPagina - 1,
    anterior: pagina > 1 ? pagina - 1 : null,
    proxima: pagina < totalPaginas ? pagina + 1 : null,
    valida,
  };
}

// "Leia também": primeiro quem tem mais categorias em comum com o artigo
// atual; em empate (inclusive zero em comum), o mais recente. Assim o bloco
// nunca fica vazio enquanto houver outro artigo publicado.
export function escolherRelacionados(atual, candidatos, limite = 3) {
  const slugsAtual = new Set((atual.categorias ?? []).map((c) => c.slug));
  return candidatos
    .filter((a) => a.id !== atual.id)
    .map((a) => ({
      artigo: a,
      emComum: (a.categorias ?? []).filter((c) => slugsAtual.has(c.slug)).length,
    }))
    .sort(
      (x, y) =>
        y.emComum - x.emComum ||
        new Date(y.artigo.publicado_em).getTime() - new Date(x.artigo.publicado_em).getTime(),
    )
    .slice(0, limite)
    .map((x) => x.artigo);
}
