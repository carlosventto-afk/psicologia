# Publicação em lote de artigos: o RLS não avisa, a mensagem chegava antes da lista e o `sticky` não funciona neste layout

**Achado em:** 2026-11-26, ao implementar a publicação em lote de `/admin/artigos` (`feat/artigos-publicar-em-lote`).

## 1. O RLS não dá erro: update sem permissão volta com zero linhas

**Sintoma/risco:** para quem não pode escrever, `update(...).select("id")` devolve `error: null` e `data: []` (medido contra o Supabase real no smoke). Contar sucesso por "não deu erro" diria "publicado" para artigo que não foi publicado.

**O que foi feito:** o lote confirma cada artigo pela linha que o banco devolve e grava o motivo no log do servidor (`[publicacao-lote] artigo não publicado: <id> <motivo>`). O banco falso dos testes imita esse comportamento e o smoke confere a premissa contra o banco real.

**Lição:** toda mutação em lote sob RLS precisa conferir as linhas afetadas. Vale um teste que nomeia a premissa ("RLS não dá erro"), porque é o tipo de coisa que o código assume sem que ninguém veja.

## 2. A mensagem de sucesso aparecia antes de a lista trocar "Rascunho" por "Publicado"

**Sintoma:** na primeira execução do smoke (29/30), depois de "2 artigos publicados." as linhas ainda mostravam "Rascunho". O banco estava certo.

**Causa:** `startTransition(async () => { await action(); setResposta(...) })` aplica o `setState` depois do `await`, e ele pintou antes de o RSC novo (do `revalidatePath`) ser aplicado.

**Correção:** `useActionState(publicarLote, null)` com `startTransition(() => publicar(ids))` (sem `<form>`), que aplica o resultado e a lista juntos. Segunda execução: 30/30. É o mesmo padrão dos outros formulários do app.

**Lição:** em Server Action que devolve valor e revalida, passar o resultado por `useActionState`. Teste de unidade não pega isso; só o navegador.

## 3. `position: sticky` não funciona neste layout

O contêiner de conteúdo de `app/(app)/layout.js` tem `overflow-x-hidden`. Pelo CSS, `overflow-x` diferente de `visible` faz o `overflow-y` virar `auto`, e esse contêiner passa a ser o "scrollport" do `sticky`, mas ele não rola (a janela rola). Por isso a barra de "Publicar selecionados" não ficou fixa ao rolar a lista (raciocínio pelo CSS; não testado no navegador).

**Correção possível (não feita, fora do escopo):** trocar por `overflow-x-clip`, que não cria contêiner de rolagem. Exige conferir o app todo.

## 4. Glob e Grep na raiz do repositório estouram o tempo

O ripgrep das ferramentas passou de 20 s na raiz (há `node_modules` na raiz e em `web/`). Sempre passar `path` apontando para `web/app`, `web/lib`, `web/components` ou `supabase/migrations`.

## 5. A nota de memória "Playwright não manda o cookie na Server Action" estava defasada

Nesta data os smokes (`smoke-admin-cobrancas.mjs` e o novo `smoke-publicar-lote.mjs`) fazem login e chamam Server Actions autenticadas pelo Playwright 1.62.1 contra build + preview, e passam. A nota foi atualizada. Se o sintoma voltar, lembrar que, pela documentação do Playwright, `request.headers()` não devolve o cabeçalho `cookie` (só `allHeaders()` devolve): a "prova" de que o cookie sumia pode ter sido efeito da forma de medir.

## Não coberto

- "Selecionar todos" com os 165 rascunhos reais: o banco falso cobre 120 artigos e o smoke publica 2 por vez, de propósito, para não mexer nos rascunhos reais de produção.
- Efeito no blog, no feed e no sitemap em produção. As rotas são dinâmicas; só se conferiu que a action revalida `/blog` e `/admin/artigos`.
