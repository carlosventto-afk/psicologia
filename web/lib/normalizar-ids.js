// O Supabase (PostgREST) devolve colunas bigint como STRING em vez de number
// (pra não perder precisão em ids muito grandes) — mas todo id neste projeto
// é pequeno, e comparar esses ids com Number(...) vindo de cookie/formulário
// (ex: `p.id === pacoteId`) falha sempre porque "3" !== 3 em JavaScript.
// Esta função converte os campos indicados pra number logo ao ler do banco,
// pra evitar esse tipo de bug em qualquer lugar que compare ids.
export function normalizarIds(objeto, campos) {
  if (!objeto) return objeto;
  const copia = { ...objeto };
  for (const campo of campos) {
    if (copia[campo] !== null && copia[campo] !== undefined) {
      copia[campo] = Number(copia[campo]);
    }
  }
  return copia;
}

export function normalizarIdsLista(lista, campos) {
  return lista.map((item) => normalizarIds(item, campos));
}
