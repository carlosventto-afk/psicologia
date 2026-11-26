# SEO e visibilidade — app, blog e busca de profissionais

Diagnóstico de 2026-11-26 e o que foi feito em resposta (branch `feat/seo-tecnico`). Tudo que é regra
de SEO mora em módulos puros testados (`web/lib/hosts.js`, `seo.js`, `blog.js`, `cartao-og.js`).

## Como o site aparece para o Google

| Host | O que é | Indexação |
| --- | --- | --- |
| `psiagente.com.br` | home, `/comparativo`, `/cadastro` | indexáveis, com canonical sem parâmetros. `/login`, `/esqueci-senha` e `/redefinir-senha` são `noindex`. Áreas logadas e rotas de máquina ficam bloqueadas no `robots.txt` |
| `www.psiagente.com.br` | — | responde 308 para o domínio principal (antes servia o mesmo conteúdo em dois endereços) |
| `blog.psiagente.com.br` | artigos, categorias (`/categoria/<slug>`), paginação (`?pagina=N`), `feed.xml` | tudo indexável; categoria com menos de 3 artigos fica `noindex` e fora do sitemap |
| `busca.psiagente.com.br` | home e perfis de profissionais | perfis indexáveis; busca com filtros é `noindex, follow`; `/ir/` bloqueado (registra contato e redireciona ao WhatsApp) |
| `comece.psiagente.com.br` | landing de campanha (repete a home) | `noindex` por meta e por cabeçalho `X-Robots-Tag` |

Cada host tem o próprio `robots.txt` e o próprio `sitemap.xml`. O `robots.txt` é uma rota só
(`web/app/robots.js`) que escolhe o conteúdo pelo cabeçalho `Host`; o sitemap é um por segmento
(`app/sitemap.js`, `app/blog/sitemap.js`, `app/busca/sitemap.js`) e o proxy prefixa `/sitemap.xml` nos
subdomínios.

## Onde está cada coisa

- `web/proxy.js` — redirecionamento do `www`, roteamento por host, `X-Robots-Tag` do `comece.`, e quais
  visitas entram no funil (`lib/hosts.js`: localhost e IP puro não entram).
- `web/lib/seo.js` — origens canônicas, robots, sitemaps, RSS, JSON-LD (Organization/WebSite, Blog,
  BlogPosting, BreadcrumbList, Person), descrições, montador de Open Graph/Twitter.
- `web/lib/blog.js` — paginação, artigos relacionados, regra de categoria fina.
- `web/lib/cartao-og.js` + `app/blog/[slug]/imagem-compartilhamento/route.js` — cartão 1200x630 de artigo sem
  capa. `web/scripts/gerar-identidade-visual.mjs` gera `og-default.png`, `logo-512.png`, `apple-icon.png` e
  `favicon.ico`.
- `web/components/JsonLd.js`, `web/components/blog/*` — dados estruturados e listagem do blog.

## Regras para manter

1. **Rota nova só para logados**: acrescentar o prefixo em `PREFIXOS_PRIVADOS` (`lib/seo.js`). Um teste garante
   que nenhuma URL do sitemap cai num bloqueio.
2. **Página pública nova**: título e descrição próprios, `alternates.canonical`, `montarCompartilhamento` e
   entrada no sitemap do host. Página que repete outra (campanha) sai do índice.
3. **Dados estruturados só com o que a página mostra.** Nada de nota/avaliação inventada (é por isso que a
   home não leva `SoftwareApplication`: o Google exige avaliação para esse tipo) e nunca o contato
   (WhatsApp) do profissional — há teste para isso.
4. **`robots.txt` não bloqueia o que precisa mostrar `noindex`** (login, recuperação): o Google só tira do
   índice o que consegue abrir.
5. `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BLOG_URL` e `NEXT_PUBLIC_BUSCA_URL` são lidas **no build** (argumentos do
   Dockerfile). Sem elas o código cai no domínio de produção, nunca em localhost.
6. Mudou logotipo ou cores: rodar `node scripts/gerar-identidade-visual.mjs` (a partir de `web/`).

## Como verificar

```
cd web
node --test "lib/**/*.test.mjs"
NEXT_PUBLIC_SITE_URL=https://psiagente.com.br NEXT_PUBLIC_BLOG_URL=https://blog.psiagente.com.br \
  NEXT_PUBLIC_BUSCA_URL=https://busca.psiagente.com.br npm run build
# copiar public/ e .next/static para dentro de .next/standalone, depois:
PORT=3100 HOSTNAME=localhost SUPABASE_SERVICE_ROLE_KEY=invalida \
  node --env-file=.env.local .next/standalone/server.js
BASE=http://localhost:3100 node scripts/smoke-seo.mjs
```

- `HOSTNAME=localhost` (e não `127.0.0.1`) importa: o Next monta a URL interna do proxy com esse valor, e com
  `127.0.0.1` a regravação `blog.…` → `localhost` é tratada como externa e o proxy roda duas vezes.
- A chave de serviço inválida impede o proxy de gravar visitas de teste em `VisitaPagina` de produção.
- O smoke só faz GET e nunca abre `/ir/<id>` (essa rota registra contato).
- Depois do deploy: `curl -sI https://www.psiagente.com.br/` (308), `https://psiagente.com.br/robots.txt`,
  `https://blog.psiagente.com.br/sitemap.xml`, e os validadores
  [Rich Results Test](https://search.google.com/test/rich-results) e
  [Schema Markup Validator](https://validator.schema.org/) na home, num artigo e num perfil.

## O que só o dono faz (conta Google e DNS)

1. [Search Console](https://search.google.com/search-console) → propriedade do tipo **Domínio** `psiagente.com.br`;
   copiar o texto `google-site-verification=...`.
2. Registro.br (o DNS está lá) → TXT com nome `@` e esse valor → Verificar. Uma verificação cobre `www`, `blog`,
   `busca` e `comece`.
3. Em Sitemaps, enviar `https://psiagente.com.br/sitemap.xml`, `https://blog.psiagente.com.br/sitemap.xml` e
   `https://busca.psiagente.com.br/sitemap.xml`.
4. Em Inspeção de URL, pedir indexação da home, de `busca.psiagente.com.br`, de um perfil e de `blog.psiagente.com.br`.
5. Bing Webmaster Tools → "Importar do Search Console" (alimenta também DuckDuckGo, Yahoo e Ecosia).
6. Em 3 a 7 dias, olhar os relatórios "Páginas" e "Desempenho".

## Linha de base e como medir (2026-09-13 a 2026-11-26, analytics próprio `VisitaPagina`)

14.841 visitas; Googlebot com 557 acessos (21 a 99 por semana), **nunca leu `/sitemap.xml`** e nunca visitou
`busca.` nem `comece.`; 103 visitas vindas do Google (set 28, out 39, nov 36). Para comparar: Googlebot
lendo os sitemaps, visitas com `referrer` do Google por mês e páginas indexadas no Search Console.
O Googlebot passa a ser contado só depois do redirecionamento do `www` (o próprio `www` não é rastreado).

## Conteúdo (não é código)

- Publicar aos poucos: 3 a 5 artigos por semana, com revisão de psicólogo. Publicar centenas de uma vez vai
  contra a política de conteúdo em escala do Google. Uma versão só por tema (o acervo de rascunhos tem 4
  variações de "distorções cognitivas", 3 de "terapia de casal", etc.).
- Autoria: todos saem como "Equipe PsiAgente" (no JSON-LD vira a organização). Um autor ou revisor real com
  CRP, preenchido no campo `autor`, vira `Person` automaticamente e fortalece conteúdo de saúde.
- Diretório: hoje tem 1 perfil visível. Sem mais perfis (com bio de pelo menos 300 caracteres) ele não aparece
  bem; páginas por cidade e especialidade só fazem sentido depois disso.
- Links externos: domínio novo cresce devagar sem eles (CRPs regionais, parcerias, perfis em redes).

### Rascunhos sugeridos para publicar primeiro (snapshot 2026-11-26, a revisar)

Evergreen, uma versão por tema e sem repetir o que já está publicado. Para conferir, buscar o título na tela
`/admin/artigos`.

Para quem procura atendimento: ansiedade — como reconhecer os sinais; psicólogo, psicoterapeuta ou psiquiatra
(qual a diferença); quando levar a criança ao psicólogo; luto; primeira sessão de terapia de casais; ciúme
patológico; ChatGPT pode substituir um psicólogo?; psicofobia; despersonalização e desrealização; anedonia e
Ativação Comportamental; EPR no tratamento do TOC; distorções cognitivas (versão "o que são e como a TCC ajuda a
identificá-las"); mecanismos de defesa; Ego, Id e Superego; telas e criatividade das crianças.

Para psicólogos (abastece o produto): contrato terapêutico (5 pontos da primeira sessão); laudos, pareceres e
prontuários; quando dar alta na TCC; burnout do psicólogo; registro provisório vencido.

As cerca de 85 notícias de CRP/CFP sem categoria ficam para depois: são perecíveis e repetem o que os próprios
conselhos publicam.
