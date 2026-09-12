# `/cadastro` trava sob requisição de prefetch (`next start`)

**Achado em:** 2026-09-12, ao testar a feature de rastreamento de visita (item 24 parte 2).

**Sintoma:** uma requisição GET pra `/cadastro` com o header `Next-Router-Prefetch: 1` nunca responde (timeout), sob `npm run start` local. Confirmado que **não** é causado pelo rastreamento — reproduzido também contra o código anterior à feature (`git stash` + rebuild), então é um problema pré-existente da rota `/cadastro` (ou de `next start` combinado com `output: standalone`, que já emite um aviso de incompatibilidade nesse modo).

**Não bloqueou nada**: requisições reais de prefetch de browser sempre vêm acompanhadas de outros headers de contexto (`Next-Url` etc.) que uma chamada `curl` sintética não reproduz — não há evidência de que isso afete tráfego real, só ficou visível ao testar manualmente com um header isolado.

**Não investigado a fundo** — ficou fora do escopo da feature que estava sendo implementada. Se reaparecer (ex: relatos de usuários travando ao passar o mouse sobre um link pro cadastro, ou o próprio App Router prefetching a página em produção), investigar:
- Se acontece também com `node .next/standalone/server.js` (o jeito "certo" de rodar com `output: standalone`, que o próprio Next avisa ser o esperado em vez de `next start`).
- Se é específico da página `/cadastro` (client component `CadastroForm` com `useActionState`) ou de qualquer página com formulário semelhante.
