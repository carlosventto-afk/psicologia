# Pipeline de conteúdo técnico/teórico de Psicologia (fontes no YouTube) — design

Status: aprovado em conversa.
Pedido do usuário: uma segunda rotina de blog, agora voltada a conteúdo
técnico/teórico de Psicologia (psicanálise, TCC, temas clínicos em geral),
pesquisando uma lista fixa de canais do YouTube, escrevendo um texto
técnico mas acessível a leigos (alguém pesquisando no Google), com imagem
de capa, citação da fonte, aviso de uso de IA, nota de responsabilidade do
criador citado, e CTA pro PsiAgente. Junto, pediu um sistema de categorias
multi-tag pro blog, pra separar esse conteúdo do de notícias CRP/CFP já
existente.

## Contexto

Já existe em produção (ver
`docs/superpowers/specs/2026-09-13-pipeline-noticias-crp-cfp-design.md`):
tabela `public.artigos`, rota `POST /api/blog/artigos` (autenticada por
`BLOG_API_SECRET`), rota `GET/POST /api/noticias` (ledger de dedup pra
notícias de conselho), e uma routine na nuvem
(`trig_01UaT7JzVFXo2iiEJ2APZmAf`, "Notícias CRP/CFP — blog diário") rodando
todo dia às 9h UTC no ambiente cloud dedicado "fontes de dados do blog"
(rede Custom, allowlist com `psiagente.com.br` + `api.pexels.com` + sites
dos conselhos).

Vale registrar um precedente direto: a routine que hoje é a de notícias
**era originalmente** uma rotina diária baseada em YouTube ("Daily blog
post"), e ficou **inoperante por semanas sem o usuário perceber** — o
ambiente não tinha credencial nem geração de imagem, a sessão "tinha
sucesso" mas não publicava nada em lugar nenhum. Essa rotina nova não pode
repetir esse padrão de falha silenciosa: qualquer falha de fonte precisa
ser contornável (pular pra próxima fonte), nunca travar a execução
inteira, e o resultado precisa ser verificável direto no banco, não só
pelo status "success" do painel de routines.

## Decisões já fechadas na conversa

1. **Mesma tabela `artigos`**, com um sistema de categorias novo por cima
   pra diferenciar os tipos de conteúdo no blog.
2. **Categorias multi-tag** (um artigo pode ter várias), não categoria
   única — tabela de junção, não coluna enum.
3. **Lista inicial de categorias**: CRP/CFP, Normas, Psicologia,
   Psicanálise, TCC, Gestão de Consultório.
4. **Cadência**: todo dia às 7h BRT (10h UTC), 2 rascunhos por execução —
   ajustável depois.
5. **Imagem de capa**: Pexels (mesmo padrão da rotina de notícias), não
   geração por IA.
6. **Publicação**: rascunho (`publicado: false`) — aprovação manual em
   `/admin/artigos`, mesmo padrão já validado.
7. **Rotina nova e independente** da de notícias (agenda própria, não
   substitui nem mescla).

## Fontes (lista fixa fornecida pelo usuário)

```
https://www.youtube.com/@chrisdunker
https://www.youtube.com/@TravessiaPsicanalitica
https://www.youtube.com/@EscolaDePsicanaliseEstrutural
https://www.youtube.com/watch?v=rwtXEBAjOmM
https://www.youtube.com/channel/UCL42p3xsCKoXhaP2v2g_zvA
https://www.youtube.com/channel/UC1pA6_DITiSf4I9wGGmlh0Q/videos
https://www.youtube.com/channel/UCICl9Q68Xg1PTMCtNSrKvtw
https://www.youtube.com/watch?v=2cr4LLD5GB0
https://www.youtube.com/@CeciliaDassiOficial
https://www.youtube.com/@minutospsiquicos
https://www.youtube.com/@comvocepsicologia
https://www.youtube.com/@terapiacognitivaonline
https://www.youtube.com/@blogsobreavida
```

Formatos mistos: handles (`@canal`), IDs de canal (`/channel/UC...`) e
vídeos específicos (`/watch?v=...`). A rotina não tem ferramenta de
transcrição de áudio — o que dá pra extrair via `WebFetch` é
título/descrição da página (do vídeo específico, ou da listagem
`/videos` do canal). O artigo é escrito com **conhecimento técnico real
de Psicologia**, usando o vídeo/canal como ponto de partida e citação —
nunca finge transcrever fala que não foi de fato lida.

## Estratégia de resiliência por fonte

Pra cada execução:

1. Embaralhar/rotacionar a lista de 13 fontes, priorizando as que não
   aparecem no ledger (`videos_referencia_blog`) nos últimos ~14 dias.
2. Para cada fonte, na ordem:
   - Se for `/watch?v=`: `WebFetch` direto na página do vídeo → título +
     descrição + canal.
   - Se for `/channel/UC.../` ou `@handle`: `WebFetch` em `.../videos` →
     tentar extrair título/link de um vídeo recente relevante ao tema
     teórico/técnico (não priorizar vídeo de corte curto/divulgação de
     evento).
   - **Se o fetch falhar ou não render nada útil, pular pra próxima
     fonte sem abortar a execução** — mesmo princípio já usado quando
     CRP-SP bloqueou por Cloudflare na rotina de notícias.
3. Continuar até reunir material pra 2 rascunhos ou esgotar as 13 fontes.
4. **Fallback de último caso** (não deveria acontecer na prática): se
   nenhuma fonte permitir identificar um vídeo específico, ainda assim
   escrever com base no que aquele canal é conhecido por abordar (pelo
   nome/handle — ex.: "TravessiaPsicanalitica" → psicanálise,
   "terapiacognitivaonline" → TCC), citando o canal (link da home) sem
   fingir um vídeo específico. Preferir sempre o caminho normal (vídeo
   identificado); isso é rede de segurança, não o fluxo esperado.
5. Antes de escrever, checar dedup via `GET
   /api/blog/videos-referencia?urls=...` com as URLs candidatas
   (vídeo, ou home do canal no caso de fallback).

## Modelo de dados

### `videos_referencia_blog` (ledger de dedup, mesmo papel que
`noticias_conselhos` tem pra notícias — tabela própria porque o nome
`noticias_conselhos` ficaria enganoso guardando URL de vídeo)

```sql
create table public.videos_referencia_blog (
  id uuid primary key default gen_random_uuid(),
  canal text not null,
  url text not null unique,
  titulo text not null,
  descricao_original text,
  publicado_em_origem date,
  usado_em_artigo_id uuid references public.artigos(id),
  descoberto_em timestamptz not null default now()
);

alter table public.videos_referencia_blog enable row level security;

create policy "videos_referencia_blog_admin_all" on public.videos_referencia_blog
  for all using (public.is_admin()) with check (public.is_admin());
```

Sem policy de leitura pública (mesmo raciocínio de `noticias_conselhos`:
só a automação lê/escreve, via `createAdminClient()`, que ignora RLS —
policy é defesa em profundidade).

### `categorias` + `artigo_categorias` (taxonomia multi-tag)

```sql
create table public.categorias (
  id bigint generated always as identity primary key,
  nome text not null,
  slug text not null unique
);

alter table public.categorias enable row level security;

create policy "categorias_select_publica" on public.categorias
  for select using (true);

create policy "categorias_admin_write" on public.categorias
  for all using (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );

insert into public.categorias (nome, slug) values
  ('CRP/CFP', 'crp-cfp'),
  ('Normas', 'normas'),
  ('Psicologia', 'psicologia'),
  ('Psicanálise', 'psicanalise'),
  ('TCC', 'tcc'),
  ('Gestão de Consultório', 'gestao-de-consultorio');

create table public.artigo_categorias (
  artigo_id uuid not null references public.artigos(id) on delete cascade,
  categoria_id bigint not null references public.categorias(id) on delete cascade,
  primary key (artigo_id, categoria_id)
);

alter table public.artigo_categorias enable row level security;

create policy "artigo_categorias_select_publica" on public.artigo_categorias
  for select using (
    exists (
      select 1 from public.artigos a
      where a.id = artigo_id and (a.publicado = true or is_admin())
    )
  );

create policy "artigo_categorias_admin_write" on public.artigo_categorias
  for all using (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );
```

RLS espelha exatamente `artigos_admin_write`/`artigos_select_publicos`
(policies já existentes, conferidas no banco de produção).

Arquivos de migration:
`supabase/migrations/20260915000001_add_videos_referencia_blog.sql`,
`supabase/migrations/20260915000002_add_categorias.sql`.

## Endpoints

### Novo: `/api/blog/videos-referencia`

Cópia exata do padrão de `web/app/api/noticias/route.js` (mesmo
`x-blog-secret`, `createAdminClient()`), trocando a tabela por
`videos_referencia_blog` e os campos por `canal`/`url`/`titulo`/
`descricao_original`/`publicado_em_origem`/`usado_em_artigo_id`.

### Alterado: `POST /api/blog/artigos`

Aceita campo novo opcional `categorias: string[]` (slugs). Mesma
convenção já usada nesse arquivo pra campos opcionais: **chave ausente
= não mexer nas categorias atuais; chave presente = substitui o
conjunto inteiro** (delete todos os vínculos existentes daquele artigo,
insere os novos). Slugs desconhecidos são ignorados silenciosamente
(não falha a criação/atualização do artigo por causa de uma categoria
mal escrita na rotina) — resolvido via `select id from categorias where
slug = any($1)` e só vincula os que existirem.

O arquivo hoje tem dois `return` separados (branch de update e branch de
criação) — o trecho abaixo entra em ambos, logo depois de obter o `id` do
artigo (`existente.id` ou `data.id`) e antes do `return` de cada branch:

```js
if (Array.isArray(body.categorias)) {
  const { data: categoriasEncontradas } = await admin
    .from("categorias")
    .select("id")
    .in("slug", body.categorias);

  const artigoId = existente?.id ?? data.id;
  await admin.from("artigo_categorias").delete().eq("artigo_id", artigoId);
  if (categoriasEncontradas?.length > 0) {
    await admin.from("artigo_categorias").insert(
      categoriasEncontradas.map((c) => ({ artigo_id: artigoId, categoria_id: c.id }))
    );
  }
}
```

### `PUBLIC_PATHS` (`web/lib/supabase/proxy.js`)

Ganha `"/api/blog/videos-referencia"` — mesma lição já registrada no
spec da rotina de notícias: rota autenticada por segredo próprio precisa
estar na lista, senão o middleware bloqueia antes dela rodar.

## Geração de imagem: Pexels (idêntico à rotina de notícias)

Mesma mecânica já documentada em
`2026-09-13-pipeline-noticias-crp-cfp-design.md`: busca por 2-4
palavras-chave em inglês derivadas do tema, `src.large` vira
`imagem_capa_url`, crédito do fotógrafo entra no rodapé.

## Conteúdo do artigo (regras embutidas no prompt da routine)

- Técnico mas acessível: alguém leigo pesquisando o termo no Google
  precisa entender sem formação em Psicologia — evitar jargão sem
  explicar, mas sem infantilizar o conceito.
- 500-800 palavras, subtítulos em markdown (`##`), mesmo estilo editorial
  dos artigos já publicados.
- Nunca apresentar o conteúdo como fala transcrita do vídeo — é uma
  explicação própria do tema, informada pelo que o vídeo/canal aborda.
- Rodapé obrigatório, nessa ordem:
  1. Citação da fonte: título do vídeo + canal + link (ou, no fallback,
     só o canal + link da home).
  2. Crédito da foto Pexels (fotógrafo + link).
  3. Aviso: "Este texto foi produzido com apoio de Inteligência
     Artificial a partir de conteúdo público divulgado por [canal]."
  4. Nota de responsabilidade: "O conteúdo técnico e as opiniões citadas
     são de responsabilidade de [canal/autor], criador do material
     original." — item novo em relação à rotina de notícias, pedido
     explicitamente pelo usuário porque aqui a fonte é uma pessoa/canal
     autoral, não uma nota institucional de conselho.
  5. CTA final ligado a uma funcionalidade específica do PsiAgente
     relacionada ao tema (parágrafo, não banner).
- `categorias` no POST: 1-3 slugs dentre os 6 existentes, escolhidos pelo
  tema do artigo (ex.: um artigo sobre transferência → `["psicanalise"]`;
  um sobre reestruturação cognitiva → `["tcc"]`; um mais geral de
  divulgação → `["psicologia"]`).

## Fluxo da routine (execução diária única)

1. Consultar o ledger (`GET /api/blog/videos-referencia`) pra saber quais
   fontes já foram usadas recentemente e priorizar as demais.
2. Percorrer as 13 fontes na ordem definida pela estratégia de
   resiliência (seção acima) até reunir material pra 2 rascunhos,
   pulando qualquer fonte que falhe.
3. Para cada tema escolhido: escrever o artigo (regras acima), buscar
   foto na Pexels, montar o markdown completo, decidir as categorias.
4. `POST /api/blog/artigos` com `publicado: false` e `categorias`.
5. `POST /api/blog/videos-referencia` registrando a fonte usada com
   `usado_em_artigo_id` do artigo recém-criado.
6. Ao final, `PushNotification` resumindo os rascunhos do dia (título +
   fonte + categorias + link pra `/admin/artigos`).

## Automação: nova routine (não mexe na de notícias)

Criar via `RemoteTrigger`/skill `schedule`, nome "Psicologia
técnica/teórica — blog diário":
- Agenda: `0 10 * * *` UTC (7h BRT).
- **Reaproveitar o ambiente cloud existente "fontes de dados do blog"**
  (já libera `psiagente.com.br` + `api.pexels.com`) — mais simples que
  criar um terceiro ambiente, já que ambas as rotinas precisam desses
  dois domínios. **Ação manual do usuário**: adicionar `youtube.com` e
  `www.youtube.com` ao allowlist Custom desse ambiente (painel
  claude.ai/code/routines → ambiente → engrenagem → Update cloud
  environment). Não há tool nesta sessão pra editar rede de ambiente
  cloud — só CRUD de routine via `RemoteTrigger`.
- `allowed_tools`: mesmo conjunto da rotina de notícias (`Bash, Read,
  Write, Edit, Glob, Grep, WebFetch, WebSearch`).
- Prompt autocontido com a lista de 13 fontes, os endpoints, as regras
  de conteúdo/compliance e a estratégia de resiliência por extenso.
- Env vars: `APP_BASE_URL`, `BLOG_API_SECRET`, `PEXELS_API_KEY` — mesmos
  valores já usados na rotina de notícias.

## UI do blog

- `/blog` (`web/app/blog/page.js`): pills de filtro por categoria no
  topo (lê `?categoria=slug` da URL, "Todos" como padrão), badges de
  categoria em cada card e no destaque. `listarArtigosPublicados`
  (`web/lib/data/artigos.js`) ganha parâmetro opcional de categoria,
  filtrando via join com `artigo_categorias`.
- Página do artigo (`web/app/blog/[slug]/page.js`): badges de categoria
  abaixo do título.
- `/admin/artigos/novo` e `/admin/artigos/[id]/editar`: multi-select
  (checkboxes) com as categorias existentes; `criarArtigo`/
  `atualizarArtigo` (`web/lib/actions/artigos.js`) passam a
  ler/gravar `artigo_categorias` (mesmo client RLS-scoped já usado
  nessas actions, sem precisar de admin client — a policy de escrita já
  cobre admin/criador_conteudo).

## Fora de escopo

- Geração de imagem por IA — mesma decisão da rotina de notícias.
- Transcrição real de áudio/vídeo do YouTube — fora do alcance das
  ferramentas disponíveis na sessão cloud; o artigo é uma explicação
  própria informada pelo tema do vídeo/canal, não um resumo do que foi
  falado.
- Publicação automática direta (`publicado: true`).
- UI de gestão de categorias (criar/editar/excluir categoria pela
  interface) — a lista inicial é fixada via seed SQL; adicionar categoria
  nova é uma migration, não uma tela, até que isso vire uma necessidade
  recorrente.
- Deduplicação por similaridade de tema entre canais diferentes — dedup
  é só por URL exata, mesmo risco aceito já registrado no spec da rotina
  de notícias.

## Testes / verificação

1. **Migrations**: aplicar em produção, confirmar `videos_referencia_blog`,
   `categorias` (com as 6 linhas seed) e `artigo_categorias` criadas com
   as policies corretas.
2. **Endpoint `/api/blog/videos-referencia`**: `curl` GET (com/sem URLs
   conhecidas) e POST (criar, upsert por URL repetida), segredo
   certo/errado.
3. **Endpoint `/api/blog/artigos` com `categorias`**: POST criando artigo
   com 2 categorias, confirmar `artigo_categorias` populada; PATCH
   trocando as categorias, confirmar substituição completa; PATCH sem o
   campo `categorias`, confirmar que os vínculos existentes não mudam.
4. **`PUBLIC_PATHS`**: confirmar que `/api/blog/videos-referencia`
   responde sem redirecionar pra `/login`.
5. **UI**: `/blog?categoria=tcc` filtra corretamente; badges aparecem no
   card e na página do artigo; `/admin/artigos/novo` salva categorias
   marcadas.
6. **Routine**: rodar manualmente uma vez (`RemoteTrigger action: run`),
   conferir via `get_run_log` que ela percorreu fontes, contornou
   qualquer falha de scraping sem abortar, chamou os três endpoints
   (`videos-referencia` GET+POST, `blog/artigos` POST), e que os 2
   rascunhos aparecem em `/admin/artigos` com `publicado = false`,
   imagem de capa, categorias e rodapé completo (fonte + crédito da foto
   + aviso de IA + nota de responsabilidade + CTA).
