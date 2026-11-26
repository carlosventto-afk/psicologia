# SEO por host: o preview mentia sobre o proxy, e o editor reescrevia escapes unicode

**Achado em:** 2026-11-26, ao implementar o PR de SEO técnico (`feat/seo-tecnico`).

## 1. Preview com `HOSTNAME=127.0.0.1` fazia o robots.txt de todos os hosts sair igual

**Sintoma:** com `Host: blog.psiagente.com.br`, o `robots.txt` voltava com o conteúdo do domínio principal e o sitemap do blog respondia 308 para `blog.psiagente.com.br/sitemap.xml` (laço). Parecia defeito do código novo (`robots.js` lendo o `Host`).

**Causa real:** o Next monta a URL interna do proxy com o `HOSTNAME` do servidor. Com `127.0.0.1`, a regravação `blog.…/` → `http://localhost:3100/blog` tem origem diferente da URL inicial (`127.0.0.1`) e é tratada como regravação **externa**: o proxy roda de novo, agora com `Host: localhost:3100`. A produção usa `HOSTNAME=0.0.0.0` e não sofre disso. Confirmado lendo `next/dist/server/lib/router-utils/resolve-routes.js` (montagem de `initURL`).

**O que foi feito:** preview com `HOSTNAME=localhost`; o motivo ficou escrito em `docs/seo.md` e no cabeçalho de `web/scripts/smoke-seo.mjs`.

**Lições:**
- Antes de culpar o código, reproduzir as condições da produção no ambiente de teste (aqui: `HOSTNAME`). Um preview que se comporta diferente da produção gera conclusões falsas nos dois sentidos.
- Roteamento por host precisa de teste com cabeçalho `Host` real (`node:http`, não `fetch`) contra o build standalone. O smoke novo faz isso e passou a ser a regressão do SEO (57 verificações, só GET).

## 2. O editor transformou ` `, ` ` e `<` em caracteres literais

**Sintoma:** `SyntaxError: Invalid regular expression: missing /` no primeiro teste do `serializarJsonLd`. O arquivo tinha o separador de linha U+2028 literal dentro da regex.

**Causa:** as ferramentas de escrita decodificam essas sequências (barra única) antes de gravar. Já reescreveram até um comentário. A forma com barra dupla dentro de string chegou intacta.

**Correção permanente:** montar os separadores por código (`String.fromCharCode(0x2028)`) e varrer o arquivo por U+2028/2029 e caracteres de controle depois de escrever. Registrado na memória do projeto (`feedback_escapes_unicode_nas_ferramentas`).

## 3. Teste contra produção polui a análise de visitas

**Sintoma:** ~350 linhas de `127.0.0.1:3100`, `localhost:3000` e `comece.localhost` na tabela `VisitaPagina` (funil de vendas), mais ~40 das minhas requisições `curl`/`Googlebot` simulado.

**Correção permanente:** `lib/hosts.js` (`deveRastrearVisita`) deixa o proxy ignorar localhost, `*.localhost`, loopback e IP puro. Para testes com `Host` de produção, o preview sobe com `SUPABASE_SERVICE_ROLE_KEY=invalida` (o proxy engole o erro). As 389 linhas foram removidas por transação com contagem esperada e cópia de segurança.

## 4. O defeito mais barato de achar foi o que nenhum teste procurava

Em produção, `/comparativo` emitia `<link rel="canonical" href="/comparativo">` e `og:url` **relativos** (sem `metadataBase`). Só apareceu ao olhar o HTML publicado. Agora o smoke confere canonical e `og:url` absolutos em todas as páginas públicas, e cada host tem seu `metadataBase`.

## Não coberto

Core Web Vitals (a API do PageSpeed estava sem cota) e o efeito real no Google (só se vê no Search Console depois do deploy e da verificação do domínio).
