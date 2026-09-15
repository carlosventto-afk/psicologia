# Pipeline de conteúdo técnico/teórico de Psicologia (YouTube) + categorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segunda rotina de blog, independente da de notícias CRP/CFP, que pesquisa uma lista fixa de 13 canais/vídeos do YouTube, escreve artigos técnicos porém acessíveis a leigos sobre teoria/prática de Psicologia (psicanálise, TCC etc.), publica como rascunho com foto Pexels + citação de fonte + aviso de IA + CTA pro PsiAgente, e classifica cada artigo em uma ou mais categorias — junto com o sistema de categorias multi-tag em si (afeta também o conteúdo já existente) e o filtro correspondente no blog público.

**Architecture:** Duas tabelas novas: `videos_referencia_blog` (ledger de dedup de fonte, mesmo papel que `noticias_conselhos` já tem pra notícias) e `categorias`/`artigo_categorias` (taxonomia multi-tag via tabela de junção, mesmo padrão já usado em `PerfilPublico`/`PerfilEspecialidade` no diretório de profissionais). Endpoint novo `/api/blog/videos-referencia` copia exatamente o padrão de `/api/noticias`. `/api/blog/artigos` ganha um campo opcional `categorias` (array de slugs) que substitui os vínculos em `artigo_categorias`. O blog público (`/blog`, `/blog/[slug]`) ganha filtro por categoria via query param; o admin (`/admin/artigos`) ganha um multi-select de categorias no formulário. Por fim, uma routine nova na nuvem (`RemoteTrigger`, ambiente cloud já existente "fontes de dados do blog" com `youtube.com` adicionado ao allowlist) roda diariamente.

**Tech Stack:** Next.js App Router (Route Handlers + Server Actions), Supabase (Postgres + RLS), Pexels API, Claude Code cloud routine (`RemoteTrigger`).

**Spec:** `docs/superpowers/specs/2026-09-15-pipeline-conteudo-teorico-psicologia-design.md`

## Global Constraints

- Mesma tabela `artigos` — categorias são uma camada por cima (tabela de junção), não uma nova tabela de conteúdo.
- Categorias são **multi-tag** (um artigo pode ter várias) — decisão explícita do usuário, não categoria única.
- Lista inicial fixa de categorias: CRP/CFP, Normas, Psicologia, Psicanálise, TCC, Gestão de Consultório (slugs: `crp-cfp`, `normas`, `psicologia`, `psicanalise`, `tcc`, `gestao-de-consultorio`).
- Cadência da rotina nova: `0 10 * * *` UTC (7h BRT), 2 rascunhos por execução.
- Imagem de capa: Pexels — mesma mecânica já usada na rotina de notícias, sem geração por IA.
- Publicação como rascunho (`publicado: false`) — sem publicação automática direta.
- Rotina nova e **independente** da de notícias (`trig_01UaT7JzVFXo2iiEJ2APZmAf`) — não mexe nela, cria uma routine separada.
- Se uma fonte (canal/vídeo) falhar ao pesquisar, a rotina pula pra próxima sem abortar a execução inteira — nunca repetir o padrão de falha silenciosa da antiga rotina "Daily blog post" baseada em YouTube.
- Sem framework de teste automatizado (convenção do projeto) — verificação por `curl`/script direto contra o banco/produção.
- Migrations aplicadas direto contra produção (convenção já estabelecida, sem staging).
- **Push e deploy exigem aprovação explícita do usuário antes de executar** — commits locais podem ser feitos livremente, mas o Task 7 deste plano PARA e pede confirmação antes de `git push` / acionar o deploy do EasyPanel.
- Slugs de categoria desconhecidos enviados por qualquer chamador de `/api/blog/artigos` são ignorados silenciosamente, nunca derrubam a criação/atualização do artigo.

---

## Arquivos deste plano

- Criar: `supabase/migrations/20260915000001_add_videos_referencia_blog.sql`
- Criar: `supabase/migrations/20260915000002_add_categorias.sql`
- Criar: `web/app/api/blog/videos-referencia/route.js`
- Modificar: `web/app/api/blog/artigos/route.js`
- Modificar: `web/lib/supabase/proxy.js` (`PUBLIC_PATHS`)
- Criar: `web/lib/data/categorias.js`
- Modificar: `web/lib/data/artigos.js`
- Modificar: `web/app/blog/page.js`
- Modificar: `web/app/blog/[slug]/page.js`
- Modificar: `web/app/globals.css`
- Modificar: `web/components/ArtigoForm.js`
- Modificar: `web/lib/actions/artigos.js`
- Modificar: `web/app/(app)/admin/artigos/novo/page.js`
- Modificar: `web/app/(app)/admin/artigos/[id]/editar/page.js`
- Modificar: `docs/status-implementacao.md`
- Criar (via API, não é arquivo do repo): routine nova no `RemoteTrigger`

---

### Task 1: Migration — `videos_referencia_blog`

**Files:**
- Create: `supabase/migrations/20260915000001_add_videos_referencia_blog.sql`

**Interfaces:**
- Produces: tabela `public.videos_referencia_blog` (`id`, `canal`, `url` unique, `titulo`, `descricao_original`, `publicado_em_origem`, `usado_em_artigo_id` → `artigos.id`, `descoberto_em`) + policy `videos_referencia_blog_admin_all` — consumida pela Task 3.

- [ ] **Step 1: Escrever a migration**

```sql
-- Ledger de dedup de vídeos do YouTube usados como fonte pela rotina de
-- conteúdo técnico/teórico de Psicologia — mesmo papel que
-- noticias_conselhos tem pra rotina de notícias CRP/CFP. Tabela própria
-- (não reaproveita noticias_conselhos) porque esse nome ficaria enganoso
-- guardando URL de vídeo. Sem policy de leitura pública: só a automação
-- (via createAdminClient, ignora RLS) e o admin acessam.
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

- [ ] **Step 2: Aplicar contra produção**

Verificar antes que `SUPABASE_DB_PASSWORD` está no ambiente (`if [ -n "$SUPABASE_DB_PASSWORD" ]; then echo presente; fi`) — se ausente, pedir ao usuário em vez de assumir. Usar a pooler URL (o host direto é IPv6-only e falha nesta rede):

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const fs = await import('fs');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260915000001_add_videos_referencia_blog.sql', 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('Migration aplicada com sucesso.');
  } catch (e) {
    await client.query('rollback');
    console.error('Falhou:', e.message);
    process.exit(1);
  }
  await client.end();
});
"
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tabela = await client.query(\"select table_name from information_schema.tables where table_name = 'videos_referencia_blog'\");
  console.log('tabela existe:', tabela.rows.length === 1);
  const policy = await client.query(\"select policyname from pg_policies where tablename = 'videos_referencia_blog'\");
  console.log('policies:', policy.rows.map(r => r.policyname));
  await client.end();
});
"
```

Expected: `tabela existe: true`, `policies: [ 'videos_referencia_blog_admin_all' ]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000001_add_videos_referencia_blog.sql
git commit -m "$(cat <<'EOF'
feat(blog): adiciona tabela videos_referencia_blog pro ledger de fontes do YouTube

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration — `categorias` + `artigo_categorias`

**Files:**
- Create: `supabase/migrations/20260915000002_add_categorias.sql`

**Interfaces:**
- Produces: tabela `public.categorias` (`id` bigint identity, `nome`, `slug` unique) seedada com 6 linhas; tabela `public.artigo_categorias` (`artigo_id` uuid → `artigos.id`, `categoria_id` bigint → `categorias.id`, PK composta) — ambas consumidas pelas Tasks 4, 5 e 6.

- [ ] **Step 1: Escrever a migration**

```sql
-- Taxonomia multi-tag do blog: um artigo pode ter várias categorias.
-- Leitura pública liberada (usada pro filtro em /blog, inclusive por
-- visitante anônimo); escrita restrita a admin/criador_conteudo, mesmo
-- padrão de artigos_admin_write.
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

-- Mesma condição de artigos_select_publicos: só expõe vínculo de artigo
-- publicado (ou qualquer um, se admin) — evita vazar tema de rascunho
-- não publicado via leitura direta desta tabela de junção.
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

- [ ] **Step 2: Aplicar contra produção**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const fs = await import('fs');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260915000002_add_categorias.sql', 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('Migration aplicada com sucesso.');
  } catch (e) {
    await client.query('rollback');
    console.error('Falhou:', e.message);
    process.exit(1);
  }
  await client.end();
});
"
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const cats = await client.query('select nome, slug from categorias order by id');
  console.log('categorias:', cats.rows);
  const policies = await client.query(\"select tablename, policyname from pg_policies where tablename in ('categorias','artigo_categorias') order by tablename, policyname\");
  console.log('policies:', policies.rows);
  await client.end();
});
"
```

Expected: 6 categorias listadas na ordem do seed; 4 policies (`categorias_select_publica`, `categorias_admin_write`, `artigo_categorias_select_publica`, `artigo_categorias_admin_write`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000002_add_categorias.sql
git commit -m "$(cat <<'EOF'
feat(blog): adiciona taxonomia multi-tag de categorias pro blog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Endpoint `/api/blog/videos-referencia`

**Files:**
- Create: `web/app/api/blog/videos-referencia/route.js`
- Modify: `web/lib/supabase/proxy.js`

**Interfaces:**
- Consumes: `createAdminClient` de `web/lib/supabase/admin.js`; tabela `videos_referencia_blog` (Task 1).
- Produces: `GET /api/blog/videos-referencia?urls=<url1>,<url2>` → `{conhecidas: [...]}`. `POST /api/blog/videos-referencia` body `{canal, url, titulo, descricao_original?, publicado_em_origem?, usado_em_artigo_id?}` → `{success: true, data}` (upsert por `url`) — consumida pela routine da Task 9.

- [ ] **Step 1: Criar a rota**

```js
// web/app/api/blog/videos-referencia/route.js
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urls = (searchParams.get("urls") ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) return Response.json({ conhecidas: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("videos_referencia_blog")
    .select("url")
    .in("url", urls);

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ conhecidas: data.map((r) => r.url) });
}

export async function POST(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { canal, url, titulo, descricao_original, publicado_em_origem, usado_em_artigo_id } = body;
  if (!canal || !url || !titulo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  const dados = {
    canal,
    url,
    titulo,
    descricao_original: descricao_original ?? null,
    publicado_em_origem: publicado_em_origem ?? null,
    usado_em_artigo_id: usado_em_artigo_id ?? null,
  };

  const { data, error } = await admin
    .from("videos_referencia_blog")
    .upsert(dados, { onConflict: "url" })
    .select()
    .single();

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ success: true, data });
}
```

- [ ] **Step 2: Liberar a rota em `PUBLIC_PATHS`**

Em `web/lib/supabase/proxy.js`, adicionar `"/api/blog/videos-referencia"` ao array `PUBLIC_PATHS` (logo depois de `"/api/noticias"`):

```js
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/completar-cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
  "/carne-leao-automatico",
  "/api/agent/call-tool",
  "/api/agent/onboarding",
  "/api/blog/artigos",
  "/api/noticias",
  "/api/blog/videos-referencia",
  "/api/asaas/webhook",
  "/api/assinaturas/aplicar-pendencias",
  "/api/emails/reprocessar-fila",
  "/api/relatorios/resumo-diario",
];
```

- [ ] **Step 3: Build local (checagem de sintaxe, sem `next dev`)**

```bash
cd web && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/app/api/blog/videos-referencia/route.js web/lib/supabase/proxy.js
git commit -m "$(cat <<'EOF'
feat(blog): adiciona rota /api/blog/videos-referencia pro dedup da rotina de YouTube

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/api/blog/artigos` aceita `categorias`

**Files:**
- Modify: `web/app/api/blog/artigos/route.js`

**Interfaces:**
- Consumes: tabela `categorias`/`artigo_categorias` (Task 2).
- Produces: `POST /api/blog/artigos` body ganha campo opcional `categorias: string[]` (slugs) — ausente = não mexe nos vínculos atuais; presente = substitui o conjunto inteiro (slugs desconhecidos são ignorados). Consumida pela routine da Task 9 e, futuramente, pelo formulário admin (Task 6, que grava direto via Server Action, não por essa rota — mas precisa do mesmo formato de dado).

- [ ] **Step 1: Adicionar a função auxiliar e chamá-la nos dois branches**

Substituir o conteúdo de `web/app/api/blog/artigos/route.js` por:

```js
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarSlug } from "@/lib/slugify";

async function vincularCategorias(admin, artigoId, categoriasSlugs) {
  const { data: categoriasEncontradas } = await admin
    .from("categorias")
    .select("id")
    .in("slug", categoriasSlugs);

  await admin.from("artigo_categorias").delete().eq("artigo_id", artigoId);

  if (categoriasEncontradas?.length > 0) {
    await admin.from("artigo_categorias").insert(
      categoriasEncontradas.map((c) => ({ artigo_id: artigoId, categoria_id: c.id }))
    );
  }
}

export async function POST(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { titulo, slug, resumo, conteudo, autor, publicado, imagem_capa_url } = body;
  const slugNormalizado = normalizarSlug(slug ?? "");

  if (!titulo || !slugNormalizado || !conteudo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Timestamp único computado uma vez e reaproveitado em todo _em desta
  // requisição (criado_em/atualizado_em/publicado_em) — evita depender do
  // relógio do servidor de banco (default now() do Postgres) e evita duas
  // chamadas separadas a Date.now() que poderiam, em tese, desalinhar
  // dateModified/datePublished no JSON-LD (achado da revisão final).
  const agora = new Date().toISOString();

  const { data: existente } = await admin
    .from("artigos")
    .select("id, publicado_em")
    .eq("slug", slugNormalizado)
    .maybeSingle();

  if (existente) {
    // Update parcial: só inclui no patch os campos opcionais que vieram
    // explicitamente no corpo da requisição. Uma chave omitida significa
    // "não mexer", não "limpar" — do contrário, um PATCH mínimo (ex.: só
    // corrigindo um typo em `conteudo`) apagaria capa/resumo/autor
    // existentes (achado da revisão final). `imagem_capa_url: null`
    // presente explicitamente continua sendo a forma legítima de remover
    // a capa via esta rota. Mesma convenção pra `categorias`.
    const patch = {
      titulo,
      slug: slugNormalizado,
      conteudo,
      atualizado_em: agora,
    };
    if ("resumo" in body) patch.resumo = resumo ?? null;
    if ("autor" in body) patch.autor = autor ?? null;
    if ("imagem_capa_url" in body) patch.imagem_capa = imagem_capa_url ?? null;
    if ("publicado" in body) {
      patch.publicado = publicado;
      if (publicado && !existente.publicado_em) {
        patch.publicado_em = agora;
      }
    }

    const { data, error } = await admin
      .from("artigos")
      .update(patch)
      .eq("id", existente.id)
      .select()
      .single();
    if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });

    if (Array.isArray(body.categorias)) {
      await vincularCategorias(admin, existente.id, body.categorias);
    }

    return Response.json({ success: true, data, acao: "atualizado" });
  }

  const dados = {
    titulo,
    slug: slugNormalizado,
    resumo: resumo ?? null,
    conteudo,
    autor: autor ?? null,
    publicado: publicado ?? false,
    imagem_capa: imagem_capa_url ?? null,
    criado_em: agora,
    atualizado_em: agora,
    publicado_em: publicado ? agora : null,
  };
  const { data, error } = await admin.from("artigos").insert(dados).select().single();
  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });

  if (Array.isArray(body.categorias) && body.categorias.length > 0) {
    await vincularCategorias(admin, data.id, body.categorias);
  }

  return Response.json({ success: true, data, acao: "criado" });
}
```

- [ ] **Step 2: Build local**

```bash
cd web && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/blog/artigos/route.js
git commit -m "$(cat <<'EOF'
feat(blog): /api/blog/artigos aceita categorias (slugs) no corpo do POST

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Blog público — filtro por categoria

**Files:**
- Create: `web/lib/data/categorias.js`
- Modify: `web/lib/data/artigos.js`
- Modify: `web/app/blog/page.js`
- Modify: `web/app/blog/[slug]/page.js`
- Modify: `web/app/globals.css`

**Interfaces:**
- Produces: `listarCategorias()` → `[{id, nome, slug}]`. `listarArtigosPublicados(categoriaSlug?)` → artigos com campo novo `categorias: [{nome, slug}]` por item, filtrados pela categoria quando informada. `buscarArtigoPublicadoPorSlug(slug)` também ganha `categorias`.

- [ ] **Step 1: Criar `web/lib/data/categorias.js`**

```js
import { createClient } from "@/lib/supabase/server";

export async function listarCategorias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, slug")
    .order("nome");

  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Atualizar `web/lib/data/artigos.js`**

Substituir `listarArtigosPublicados` e `buscarArtigoPublicadoPorSlug` por:

```js
export async function listarArtigosPublicados(categoriaSlug) {
  const supabase = await createClient();

  let idsFiltrados = null;
  if (categoriaSlug) {
    const { data: categoria } = await supabase
      .from("categorias")
      .select("id")
      .eq("slug", categoriaSlug)
      .maybeSingle();

    if (!categoria) return [];

    const { data: vinculos, error: erroVinculos } = await supabase
      .from("artigo_categorias")
      .select("artigo_id")
      .eq("categoria_id", categoria.id);

    if (erroVinculos) throw new Error(erroVinculos.message);
    idsFiltrados = vinculos.map((v) => v.artigo_id);
    if (idsFiltrados.length === 0) return [];
  }

  let query = supabase
    .from("artigos")
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado_em, imagem_capa, artigo_categorias(categorias(nome, slug))"
    )
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  if (idsFiltrados) query = query.in("id", idsFiltrados);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data.map((a) => ({
    ...a,
    categorias: (a.artigo_categorias || []).map((ac) => ac.categorias),
  }));
}

export async function buscarArtigoPublicadoPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado_em, atualizado_em, imagem_capa, artigo_categorias(categorias(nome, slug))"
    )
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    categorias: (data.artigo_categorias || []).map((ac) => ac.categorias),
  };
}
```

(`listarArtigosAdmin` e `buscarArtigoAdmin` ficam intocadas nesta task — `buscarArtigoAdmin` ganha `categoria_ids` na Task 6, que é quem realmente precisa disso.)

- [ ] **Step 3: Pills de filtro + badges em `web/app/blog/page.js`**

Reescrever o arquivo:

```js
import Link from "next/link";
import { listarArtigosPublicados } from "@/lib/data/artigos";
import { listarCategorias } from "@/lib/data/categorias";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

export default async function PaginaBlog({ searchParams }) {
  const { categoria } = await searchParams;
  const [artigos, categorias] = await Promise.all([
    listarArtigosPublicados(categoria),
    listarCategorias(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="page-title mb-4">Blog</h1>

        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/"
            className={`blog-categoria-pill ${!categoria ? "blog-categoria-pill-ativa" : ""}`}
          >
            Todos
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.slug}
              href={`/?categoria=${c.slug}`}
              className={`blog-categoria-pill ${categoria === c.slug ? "blog-categoria-pill-ativa" : ""}`}
            >
              {c.nome}
            </Link>
          ))}
        </div>

        {artigos.length === 0 ? (
          <p className="empty-state">Nenhum artigo publicado nessa categoria ainda.</p>
        ) : (
          (() => {
            const [destaque, ...restantes] = artigos;
            return (
              <>
                <Link href={`/${destaque.slug}`} className="blog-hero">
                  {destaque.imagem_capa ? (
                    <img src={destaque.imagem_capa} alt={destaque.titulo} className="blog-hero-img" />
                  ) : (
                    <div className="blog-hero-fallback" />
                  )}
                  <div className="blog-hero-body">
                    {destaque.categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {destaque.categorias.map((c) => (
                          <span key={c.slug} className="blog-categoria-badge">
                            {c.nome}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="blog-meta">
                      {new Date(destaque.publicado_em).toLocaleDateString("pt-BR")}
                      {destaque.autor && ` · ${destaque.autor}`}
                      {` · ${calcularTempoLeitura(destaque.conteudo)} min de leitura`}
                    </p>
                    <h2 className="font-display text-2xl font-bold text-navy mt-2">{destaque.titulo}</h2>
                    {destaque.resumo && <p className="text-muted mt-2">{destaque.resumo}</p>}
                  </div>
                </Link>

                {restantes.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2 mt-8">
                    {restantes.map((a) => (
                      <Link key={a.id} href={`/${a.slug}`} className="card overflow-hidden block">
                        {a.imagem_capa ? (
                          <img src={a.imagem_capa} alt={a.titulo} className="blog-card-img" />
                        ) : (
                          <div className="blog-card-fallback">
                            <span>{a.titulo}</span>
                          </div>
                        )}
                        <div className="p-5">
                          {a.categorias.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {a.categorias.map((c) => (
                                <span key={c.slug} className="blog-categoria-badge">
                                  {c.nome}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="blog-meta">
                            {new Date(a.publicado_em).toLocaleDateString("pt-BR")}
                            {a.autor && ` · ${a.autor}`}
                            {` · ${calcularTempoLeitura(a.conteudo)} min`}
                          </p>
                          <h2 className="text-lg font-bold text-navy mt-1">{a.titulo}</h2>
                          {a.resumo && <p className="text-sm text-muted mt-2">{a.resumo}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
```

Nota: os links de filtro usam `/` e `/?categoria=slug` (sem prefixo `/blog`) porque, no subdomínio `blog.psiagente.com.br`, o `proxy.js` já reescreve tudo internamente pra dentro de `/blog/...` — um link com `/blog` aqui dentro duplicaria o prefixo (mesmo motivo pelo qual os links de artigo já são `/${slug}`, não `/blog/${slug}`).

- [ ] **Step 4: Badges na página do artigo (`web/app/blog/[slug]/page.js`)**

Dentro do `<article>`, logo abaixo do `<h1>` (no bloco que hoje tem só a data/autor/tempo de leitura), adicionar as badges. Trecho a alterar:

```js
      <div>
        <p className="text-xs text-muted">
          {new Date(artigo.publicado_em).toLocaleDateString("pt-BR")}
          {artigo.autor && ` · ${artigo.autor}`}
          {` · ${tempoLeitura} min de leitura`}
        </p>
        <h1 className="page-title mt-1">{artigo.titulo}</h1>
      </div>
```

vira:

```js
      <div>
        <p className="text-xs text-muted">
          {new Date(artigo.publicado_em).toLocaleDateString("pt-BR")}
          {artigo.autor && ` · ${artigo.autor}`}
          {` · ${tempoLeitura} min de leitura`}
        </p>
        <h1 className="page-title mt-1">{artigo.titulo}</h1>
        {artigo.categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {artigo.categorias.map((c) => (
              <Link key={c.slug} href={`/?categoria=${c.slug}`} className="blog-categoria-badge">
                {c.nome}
              </Link>
            ))}
          </div>
        )}
      </div>
```

Adicionar `import Link from "next/link";` no topo do arquivo (ainda não importado ali).

- [ ] **Step 5: CSS das pills/badges em `web/app/globals.css`**

Adicionar logo depois do bloco `.blog-meta` (antes de `.glow-suave`):

```css
  .blog-categoria-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.85rem;
    border-radius: 9999px;
    border: 1px solid var(--color-border);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-navy);
    background: var(--color-surface);
  }

  .blog-categoria-pill-ativa {
    background: var(--color-navy);
    border-color: var(--color-navy);
    color: #ffffff;
  }

  .blog-categoria-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.6rem;
    border-radius: 9999px;
    background: var(--color-primary-dark);
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 600;
  }
```

- [ ] **Step 6: Build local**

```bash
cd web && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 7: Commit**

```bash
git add web/lib/data/categorias.js web/lib/data/artigos.js web/app/blog/page.js web/app/blog/[slug]/page.js web/app/globals.css
git commit -m "$(cat <<'EOF'
feat(blog): filtro de categoria no blog publico (pills + badges)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin — multi-select de categorias no formulário de artigo

**Files:**
- Modify: `web/lib/data/artigos.js` (`buscarArtigoAdmin`)
- Modify: `web/lib/actions/artigos.js` (`criarArtigo`, `atualizarArtigo`)
- Modify: `web/components/ArtigoForm.js`
- Modify: `web/app/(app)/admin/artigos/novo/page.js`
- Modify: `web/app/(app)/admin/artigos/[id]/editar/page.js`

**Interfaces:**
- Consumes: `listarCategorias()` (Task 5), tabela `artigo_categorias` (Task 2).
- Produces: `buscarArtigoAdmin(id)` retorna `categoria_ids: number[]` além dos campos atuais.

- [ ] **Step 1: `buscarArtigoAdmin` ganha `categoria_ids`**

Em `web/lib/data/artigos.js`, trocar:

```js
export async function buscarArtigoAdmin(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, conteudo, autor, publicado, publicado_em, imagem_capa")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

por:

```js
export async function buscarArtigoAdmin(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select(
      "id, titulo, slug, resumo, conteudo, autor, publicado, publicado_em, imagem_capa, artigo_categorias(categoria_id)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return {
    ...data,
    categoria_ids: (data.artigo_categorias || []).map((ac) => ac.categoria_id),
  };
}
```

- [ ] **Step 2: `criarArtigo`/`atualizarArtigo` gravam `artigo_categorias`**

Em `web/lib/actions/artigos.js`, em `criarArtigo`, trocar o final da função (a partir do `insert`):

```js
  const { error } = await supabase.from("artigos").insert({
    titulo: formData.get("titulo"),
    slug: slugNormalizado,
    resumo: formData.get("resumo") || null,
    conteudo: formData.get("conteudo"),
    autor: formData.get("autor") || null,
    imagem_capa: imagemCapa,
    publicado,
    publicado_em: publicado ? agora : null,
    criado_em: agora,
    atualizado_em: agora,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível salvar o artigo." };
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  redirect("/admin/artigos");
```

por:

```js
  const { data: novoArtigo, error } = await supabase
    .from("artigos")
    .insert({
      titulo: formData.get("titulo"),
      slug: slugNormalizado,
      resumo: formData.get("resumo") || null,
      conteudo: formData.get("conteudo"),
      autor: formData.get("autor") || null,
      imagem_capa: imagemCapa,
      publicado,
      publicado_em: publicado ? agora : null,
      criado_em: agora,
      atualizado_em: agora,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível salvar o artigo." };
  }

  const categoriaIds = formData.getAll("categorias");
  if (categoriaIds.length > 0) {
    await supabase
      .from("artigo_categorias")
      .insert(categoriaIds.map((categoriaId) => ({ artigo_id: novoArtigo.id, categoria_id: categoriaId })));
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  redirect("/admin/artigos");
```

E em `atualizarArtigo`, trocar o final (a partir do `update`):

```js
  const { error } = await supabase
    .from("artigos")
    .update({
      titulo: formData.get("titulo"),
      slug: slugNormalizado,
      resumo: formData.get("resumo") || null,
      conteudo: formData.get("conteudo"),
      autor: formData.get("autor") || null,
      imagem_capa: imagemCapa,
      publicado,
      publicado_em: publicadoEm,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível atualizar o artigo." };
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${atual.slug}`);
  redirect("/admin/artigos");
```

por:

```js
  const { error } = await supabase
    .from("artigos")
    .update({
      titulo: formData.get("titulo"),
      slug: slugNormalizado,
      resumo: formData.get("resumo") || null,
      conteudo: formData.get("conteudo"),
      autor: formData.get("autor") || null,
      imagem_capa: imagemCapa,
      publicado,
      publicado_em: publicadoEm,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível atualizar o artigo." };
  }

  await supabase.from("artigo_categorias").delete().eq("artigo_id", id);
  const categoriaIds = formData.getAll("categorias");
  if (categoriaIds.length > 0) {
    await supabase
      .from("artigo_categorias")
      .insert(categoriaIds.map((categoriaId) => ({ artigo_id: id, categoria_id: categoriaId })));
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${atual.slug}`);
  redirect("/admin/artigos");
```

(Mesmo padrão delete-então-insert já usado em `salvarPerfil`/`PerfilEspecialidade`, `web/lib/actions/diretorio.js:136-157`.)

- [ ] **Step 3: `ArtigoForm` ganha o multi-select**

Em `web/components/ArtigoForm.js`, mudar a assinatura do componente e adicionar o bloco de checkboxes antes do checkbox "Publicar agora":

```js
export default function ArtigoForm({ action, artigo, categorias }) {
```

Adicionar logo antes do bloco `<div className="flex items-center gap-2">` do campo `publicado`:

```js
      <div>
        <p className="block text-sm font-semibold text-navy mb-2">Categorias</p>
        <div className="grid grid-cols-2 gap-2">
          {categorias.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                name="categorias"
                value={cat.id}
                defaultChecked={artigo?.categoria_ids?.includes(cat.id)}
              />
              {cat.nome}
            </label>
          ))}
        </div>
      </div>
```

- [ ] **Step 4: Páginas `novo`/`editar` passam `categorias`**

`web/app/(app)/admin/artigos/novo/page.js`:

```js
import ArtigoForm from "@/components/ArtigoForm";
import { criarArtigo } from "@/lib/actions/artigos";
import { listarCategorias } from "@/lib/data/categorias";

export default async function PaginaNovoArtigo() {
  const categorias = await listarCategorias();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Artigo</h1>
      <ArtigoForm action={criarArtigo} categorias={categorias} />
    </div>
  );
}
```

`web/app/(app)/admin/artigos/[id]/editar/page.js`:

```js
import ArtigoForm from "@/components/ArtigoForm";
import { buscarArtigoAdmin } from "@/lib/data/artigos";
import { listarCategorias } from "@/lib/data/categorias";
import { atualizarArtigo } from "@/lib/actions/artigos";

export default async function PaginaEditarArtigo({ params }) {
  const { id } = await params;
  const [artigo, categorias] = await Promise.all([buscarArtigoAdmin(id), listarCategorias()]);
  const acaoComId = atualizarArtigo.bind(null, id);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Artigo</h1>
      <ArtigoForm action={acaoComId} artigo={artigo} categorias={categorias} />
    </div>
  );
}
```

- [ ] **Step 5: Build local**

```bash
cd web && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add web/lib/data/artigos.js web/lib/actions/artigos.js web/components/ArtigoForm.js "web/app/(app)/admin/artigos/novo/page.js" "web/app/(app)/admin/artigos/[id]/editar/page.js"
git commit -m "$(cat <<'EOF'
feat(admin): multi-select de categorias no formulario de artigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Push e deploy (checkpoint de aprovação)

**Files:** nenhum arquivo novo — só integração.

**Interfaces:** nenhuma nova.

- [ ] **Step 1: PARAR e pedir aprovação explícita do usuário pra `git push`**

Mostrar `git log --oneline origin/main..HEAD` e perguntar em texto livre antes de prosseguir — não assumir que a aprovação do design/plano autoriza o push.

- [ ] **Step 2: Push (só depois do "sim" explícito)**

```bash
git push origin main
```

- [ ] **Step 3: Disparar o deploy via EasyPanel API**

Requer um token fresco de `Settings → API` no dashboard do EasyPanel (pedir ao usuário se não estiver disponível nesta conversa):

```bash
curl -s -X POST "http://179.198.103.130:3000/api/trpc/services.app.deployService" \
  -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"psifacil","serviceName":"psifacil"}}'
```

Expected: resposta `{}` (sucesso). Confirmar com `docker service inspect psifacil_psifacil --format '{{.UpdatedAt}}'` (via SSH) que o timestamp avançou, ou aguardar ~1-2 min e testar os endpoints novos (Task 8).

---

### Task 8: Verificar endpoints novos em produção

**Files:** nenhum.

**Interfaces:**
- Consumes: `BLOG_API_SECRET` já configurado em produção (mesmo segredo usado por `/api/blog/artigos` e `/api/noticias` — não gerar um novo).

- [ ] **Step 1: Recuperar o valor real de `BLOG_API_SECRET`**

```bash
curl -s "http://179.198.103.130:3000/api/trpc/projects.inspectProject?input=%7B%22json%22%3A%7B%22projectName%22%3A%22psifacil%22%7D%7D" \
  -H "Authorization: Bearer $EASYPANEL_TOKEN" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j = JSON.parse(d);
  const app = j.result.data.json.services.find(s => s.name === 'psifacil' || s.serviceName === 'psifacil');
  console.log(JSON.stringify(app?.env ?? app, null, 2));
});
"
```

Extrair `BLOG_API_SECRET` (tratar como sensível — só usar em memória pro resto desta task e pra Task 9).

- [ ] **Step 2: Testar `/api/blog/videos-referencia`**

```bash
BLOG_SECRET="<valor extraído no Step 1>"
curl -s -X POST "https://psiagente.com.br/api/blog/videos-referencia" \
  -H "Content-Type: application/json" \
  -H "x-blog-secret: $BLOG_SECRET" \
  -d '{"canal":"teste","url":"https://youtube.com/watch?v=teste-apagar","titulo":"Vídeo de teste (apagar)"}'
```

Expected: `{"success":true,"data":{...}}`.

```bash
curl -s "https://psiagente.com.br/api/blog/videos-referencia?urls=https://youtube.com/watch?v=teste-apagar" \
  -H "x-blog-secret: $BLOG_SECRET"
```

Expected: `{"conhecidas":["https://youtube.com/watch?v=teste-apagar"]}`.

```bash
curl -s -X POST "https://psiagente.com.br/api/blog/videos-referencia" -H "Content-Type: application/json" -d '{"canal":"x","url":"x","titulo":"x"}'
```

Expected: `401` (sem segredo).

- [ ] **Step 3: Testar `categorias` em `/api/blog/artigos`**

```bash
curl -s -X POST "https://psiagente.com.br/api/blog/artigos" \
  -H "Content-Type: application/json" \
  -H "x-blog-secret: $BLOG_SECRET" \
  -d '{"titulo":"Artigo de teste categorias (apagar)","slug":"teste-categorias-apagar","conteudo":"conteudo de teste","publicado":false,"categorias":["tcc","psicanalise"]}'
```

Expected: `{"success":true,"data":{...},"acao":"criado"}`. Guardar o `id` retornado.

- [ ] **Step 4: Confirmar vínculo e limpar os dados de teste**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(\"select a.id, a.titulo, c.slug from artigos a join artigo_categorias ac on ac.artigo_id = a.id join categorias c on c.id = ac.categoria_id where a.slug = 'teste-categorias-apagar'\");
  console.log('vinculos:', r.rows);
  await client.query(\"delete from artigos where slug = 'teste-categorias-apagar'\");
  await client.query(\"delete from videos_referencia_blog where url = 'https://youtube.com/watch?v=teste-apagar'\");
  console.log('Dados de teste apagados.');
  await client.end();
});
"
```

Expected: `vinculos` mostra 2 linhas (`tcc` e `psicanalise`) antes da limpeza.

---

### Task 9: Preparar a routine nova (ambiente + allowlist)

**Files:** nenhum arquivo do repo.

**Interfaces:**
- Consumes: `environment_id` do ambiente cloud "fontes de dados do blog", hoje já usado por `trig_01UaT7JzVFXo2iiEJ2APZmAf`.

- [ ] **Step 1: Descobrir o `environment_id` do ambiente já existente**

```
RemoteTrigger({action: "get", trigger_id: "trig_01UaT7JzVFXo2iiEJ2APZmAf"})
```

Extrair `job_config.ccr.environment_id` da resposta.

- [ ] **Step 2: PARAR e pedir ao usuário pra adicionar `youtube.com`/`www.youtube.com` ao allowlist**

Não há tool nesta sessão pra editar a rede de um ambiente cloud (só CRUD de routine via `RemoteTrigger`). Pedir ao usuário, em texto livre: painel claude.ai/code/routines → abrir o ambiente "fontes de dados do blog" (ícone de nuvem) → engrenagem → "Update cloud environment" → Network access → Custom → adicionar `youtube.com` e `www.youtube.com` à lista já existente (que hoje tem `psiagente.com.br`, `api.pexels.com` e os domínios dos conselhos — não remover nada, só adicionar).

Aguardar confirmação explícita antes de seguir pra Task 10 — sem isso, a rotina nova vai falhar em toda tentativa de `WebFetch` no YouTube, do mesmo jeito que a rotina antiga falhou silenciosamente.

---

### Task 10: Criar a routine nova

**Files:** nenhum arquivo do repo — chamada de API (`RemoteTrigger`).

**Interfaces:**
- Consumes: `environment_id` (Task 9), `BLOG_API_SECRET` + `PEXELS_API_KEY` (Task 8/já em uso pela rotina de notícias), endpoints `/api/blog/artigos`, `/api/blog/videos-referencia` (Tasks 3-4, 8).

- [ ] **Step 1: Montar o prompt da routine**

Prompt autocontido (a sessão cloud começa sem contexto nenhum):

```
Você é a rotina diária de conteúdo técnico/teórico de Psicologia do blog
do PsiAgente (https://psiagente.com.br), um SaaS de gestão de consultório
pra psicólogos. Sua tarefa: pesquisar uma lista fixa de canais/vídeos do
YouTube sobre Psicologia, escolher 2 temas técnicos/teóricos relevantes, e
publicar 2 rascunhos de post por dia — SEM nunca travar a execução inteira
por causa de uma fonte que falhar.

FONTES (lista fixa — não pesquisar outras):
- https://www.youtube.com/@chrisdunker
- https://www.youtube.com/@TravessiaPsicanalitica
- https://www.youtube.com/@EscolaDePsicanaliseEstrutural
- https://www.youtube.com/watch?v=rwtXEBAjOmM
- https://www.youtube.com/channel/UCL42p3xsCKoXhaP2v2g_zvA
- https://www.youtube.com/channel/UC1pA6_DITiSf4I9wGGmlh0Q/videos
- https://www.youtube.com/channel/UCICl9Q68Xg1PTMCtNSrKvtw
- https://www.youtube.com/watch?v=2cr4LLD5GB0
- https://www.youtube.com/@CeciliaDassiOficial
- https://www.youtube.com/@minutospsiquicos
- https://www.youtube.com/@comvocepsicologia
- https://www.youtube.com/@terapiacognitivaonline
- https://www.youtube.com/@blogsobreavida

CATEGORIAS DISPONÍVEIS (usar 1-3 slugs por artigo, os que fizerem sentido
pro tema): crp-cfp, normas, psicologia, psicanalise, tcc,
gestao-de-consultorio.

PASSO A PASSO:
1. Embaralhe a ordem das 13 fontes acima (não siga sempre a mesma ordem).
2. Para cada fonte, na ordem embaralhada, tente identificar um vídeo
   específico e seu tema:
   - Se a URL for de um vídeo específico (/watch?v=...), dê WebFetch
     direto nela e extraia título + descrição + nome do canal.
   - Se for de um canal (/@handle ou /channel/UC...), dê WebFetch em
     <url>/videos (adicionando /videos se não estiver no fim) e tente
     identificar um vídeo recente com tema técnico/teórico (evite vídeo
     de corte curto, divulgação de evento ou live sem conteúdo teórico
     claro no título).
   - **Se o WebFetch falhar, retornar vazio, ou não der pra identificar
     um vídeo específico, ABANDONE essa fonte e vá pra próxima da lista
     imediatamente — nunca pare a execução por causa disso.**
3. Antes de escrever sobre um vídeo, confira se ele já foi usado:
   GET https://psiagente.com.br/api/blog/videos-referencia?urls=<url>
   Header: x-blog-secret: $BLOG_API_SECRET
   Se a URL aparecer em "conhecidas", pule pra próxima fonte.
4. Continue percorrendo as fontes até ter 2 temas novos e válidos, ou até
   esgotar as 13. Se esgotar todas sem conseguir identificar nenhum vídeo
   específico em nenhuma (cenário raro), escolha 2 fontes ao acaso e
   escreva com base no que aquele canal costuma abordar pelo nome/handle
   (ex.: "TravessiaPsicanalitica" → psicanálise, "terapiacognitivaonline"
   → TCC), citando o canal e o link da home dele em vez de um vídeo
   específico.
5. Para cada tema escolhido, escreva um artigo de 500-800 palavras:
   - Técnico mas acessível: alguém leigo pesquisando o termo no Google
     precisa entender sem formação em Psicologia — explique jargão
     técnico quando usar, sem infantilizar o conceito.
   - Nunca apresente o texto como se fosse a fala transcrita do vídeo —
     é uma explicação própria do tema, com seu próprio conhecimento
     técnico de Psicologia, usando o vídeo/canal como ponto de partida e
     citação, não como fonte literal de frases.
   - Estrutura em markdown com subtítulos (##).
   - Rodapé obrigatório, nesta ordem:
     a) Citação da fonte: "Tema inspirado no vídeo '[título]', do canal
        [canal] ([link do vídeo])." — ou, no caso do fallback do passo 4,
        "Tema relacionado ao conteúdo do canal [canal] ([link da home])."
     b) Crédito da foto (fotógrafo + link, ver passo 6).
     c) Aviso: "Este texto foi produzido com apoio de Inteligência
        Artificial a partir de conteúdo público divulgado por [canal]."
     d) Nota de responsabilidade: "O conteúdo técnico e as opiniões
        citadas são de responsabilidade de [canal/autor], criador do
        material original."
     e) Um parágrafo de CTA conectando o tema a algum recurso do
        PsiAgente (agenda, financeiro, prontuário, NFS-e, WhatsApp) —
        nunca um banner, um parágrafo natural de fechamento.
6. Busque 1 foto no Pexels pro tema:
   GET https://api.pexels.com/v1/search?query=<2-4 palavras em inglês>&orientation=landscape&per_page=5
   Header: Authorization: $PEXELS_API_KEY
   Escolha uma foto com contexto de psicologia/terapia/atendimento, evite
   clichê genérico. Pegue `src.large` (URL) e `photographer`/
   `photographer_url` (pro crédito no rodapé).
7. Publique o rascunho:
   POST https://psiagente.com.br/api/blog/artigos
   Header: x-blog-secret: $BLOG_API_SECRET, Content-Type: application/json
   Body: {"titulo": "...", "slug": "...", "resumo": "...", "conteudo": "...markdown completo com rodapé...", "autor": "Equipe PsiAgente", "publicado": false, "imagem_capa_url": "<url da foto Pexels>", "categorias": ["slug1", "slug2"]}
8. Registre a fonte como usada (pegue o "id" retornado no passo 7 como
   usado_em_artigo_id):
   POST https://psiagente.com.br/api/blog/videos-referencia
   Header: x-blog-secret: $BLOG_API_SECRET, Content-Type: application/json
   Body: {"canal": "<nome/handle do canal>", "url": "<url do vídeo ou da home do canal no fallback>", "titulo": "<título do vídeo ou 'Conteúdo geral do canal' no fallback>", "descricao_original": "<1-2 frases>", "usado_em_artigo_id": "<id do passo 7>"}
9. Repita 5-8 pra cada tema escolhido (2 no total).
10. Ao final, envie uma notificação (PushNotification) resumindo os
    rascunhos criados hoje: título, canal/vídeo fonte, categorias, e um
    lembrete de que estão como rascunho em /admin/artigos aguardando
    aprovação. Se não conseguiu identificar nenhum vídeo específico em
    NENHUMA das 13 fontes, diga isso explicitamente na notificação.

Nunca publique com publicado:true — sempre rascunho (publicado:false).
```

- [ ] **Step 2: Criar a routine via `RemoteTrigger`**

```
RemoteTrigger({
  action: "create",
  body: {
    name: "Psicologia técnica/teórica — blog diário",
    cron_expression: "0 10 * * *",
    job_config: {
      ccr: {
        environment_id: "<environment_id extraído na Task 9>",
        session_context: {
          model: "claude-sonnet-5",
          allowed_tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]
        },
        events: [{ data: {
          uuid: "<uuid v4 novo>",
          session_id: "",
          type: "user",
          parent_tool_use_id: null,
          message: { role: "user", content: "<prompt do Step 1>" }
        }}],
        environment_variables: {
          BLOG_API_SECRET: "<mesmo valor já usado pela rotina de notícias, extraído na Task 8>",
          PEXELS_API_KEY: "<mesma chave já usada pela rotina de notícias>"
        }
      }
    }
  }
})
```

Nota: seguir o mesmo formato de payload já usado com sucesso pra atualizar
`trig_01UaT7JzVFXo2iiEJ2APZmAf` (ver
`docs/superpowers/plans/2026-09-13-pipeline-noticias-crp-cfp.md`, Task 5)
— se `action: "create"` exigir um formato diferente de `action: "update"`,
inspecionar a resposta de erro e ajustar, ou usar
`RemoteTrigger({action:"get", trigger_id:"trig_01UaT7JzVFXo2iiEJ2APZmAf"})`
como referência de shape.

- [ ] **Step 3: Confirmar a criação**

```
RemoteTrigger({action: "list"})
```

Expected: aparece a routine nova "Psicologia técnica/teórica — blog diário" com `cron_expression: "0 10 * * *"`, separada de `trig_01UaT7JzVFXo2iiEJ2APZmAf` (que continua intacta). Anotar o `trigger_id` novo pra Task 11.

---

### Task 11: Rodar a routine uma vez e verificar o resultado

**Files:** nenhum.

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Disparar a execução manual**

```
RemoteTrigger({action: "run", trigger_id: "<trigger_id da Task 10>"})
```

- [ ] **Step 2: Acompanhar a execução**

```
RemoteTrigger({action: "list_runs", trigger_id: "<trigger_id da Task 10>"})
```

Pegar o `session_id` do run mais recente:

```
RemoteTrigger({action: "get_run_log", session_id: "<session_id>"})
```

Verificar no log: percorreu fontes (idealmente múltiplas, contornando qualquer falha de `WebFetch` no YouTube sem abortar), chamou `GET /api/blog/videos-referencia` antes de escrever, chamou `POST /api/blog/artigos` e `POST /api/blog/videos-referencia` pra cada rascunho, chamou a Pexels API, terminou com `PushNotification`. Se travar em algum ponto (ex.: erro 401, campo obrigatório faltando, `youtube.com` ainda bloqueado por rede), o log mostra o `tool_result` de erro — corrigir a rota/prompt/allowlist conforme o erro real, não especular.

- [ ] **Step 3: Confirmar os rascunhos no banco**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(\"select id, titulo, slug, publicado, imagem_capa is not null as tem_capa, criado_em from artigos order by criado_em desc limit 5\");
  console.log('artigos:', r.rows);
  const c = await client.query(\"select a.titulo, array_agg(cat.slug) as categorias from artigos a join artigo_categorias ac on ac.artigo_id = a.id join categorias cat on cat.id = ac.categoria_id where a.id = any($1::uuid[]) group by a.id, a.titulo\", [r.rows.map(x => x.id)]);
  console.log('categorias por artigo:', c.rows);
  const v = await client.query(\"select canal, titulo, usado_em_artigo_id is not null as usado from videos_referencia_blog order by descoberto_em desc limit 5\");
  console.log('videos_referencia_blog:', v.rows);
  await client.end();
});
"
```

Expected: 2 artigos novos com `publicado: false` e `tem_capa: true`, cada um com 1-3 categorias válidas, e as fontes correspondentes em `videos_referencia_blog` com `usado: true`. Conferir manualmente em `/admin/artigos` que o conteúdo é tecnicamente correto, acessível, cita a fonte, tem o aviso de IA, a nota de responsabilidade e o CTA — se algo estiver fora do esperado, ajustar o prompt da routine (Task 10) e rodar de novo.

---

### Task 12: Documentação

**Files:**
- Modify: `docs/status-implementacao.md`

**Interfaces:** nenhuma.

- [ ] **Step 1: Documentar o pipeline**

Adicionar uma seção descrevendo: tabelas `videos_referencia_blog` e `categorias`/`artigo_categorias` (com a lista das 6 categorias seed), rotas `/api/blog/videos-referencia` e `/api/blog/artigos` (campo `categorias`), o filtro por categoria no blog público, o multi-select no admin, a routine nova (nome, `trigger_id`, agenda `0 10 * * *` UTC, ambiente cloud reaproveitado com `youtube.com` adicionado ao allowlist), e o estado atual (publicação em rascunho, aguardando validação).

- [ ] **Step 2: Commit**

```bash
git add docs/status-implementacao.md
git commit -m "$(cat <<'EOF'
docs: documenta o pipeline de conteudo tecnico/teorico de psicologia e as categorias do blog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Cobertura da spec:** ledger de vídeos (Task 1), taxonomia multi-tag (Task 2), endpoint de dedup de vídeos (Task 3), `categorias` em `/api/blog/artigos` (Task 4), filtro público + badges (Task 5), multi-select admin (Task 6), Pexels + conteúdo/compliance + resiliência por fonte + fallback (prompt da Task 10), automação com routine independente (Tasks 9-10), verificação end-to-end (Task 11) — todas as seções da spec têm task ou trecho de prompt correspondente. UI de gestão de categorias e transcrição de vídeo foram marcadas "fora de escopo" na spec e não têm task aqui, como esperado.

**Placeholders:** os únicos valores não-literais são credenciais (`BLOG_API_SECRET`, `PEXELS_API_KEY`, `EASYPANEL_TOKEN`), IDs gerados em runtime (`uuid` do evento, `environment_id`, `trigger_id` da routine nova, `session_id` do run) — inerentes a valor só conhecido em execução, não "TBD" de design em aberto.

**Consistência:** `x-blog-secret`/`BLOG_API_SECRET` idêntico nas Tasks 3, 4, 8 e 10. Nome de coluna `usado_em_artigo_id` consistente entre a migration (Task 1), a rota (Task 3) e o prompt (Task 10). Slugs de categoria (`crp-cfp`, `normas`, `psicologia`, `psicanalise`, `tcc`, `gestao-de-consultorio`) idênticos entre a migration (Task 2), o prompt da routine (Task 10) e os exemplos de teste (Task 8). Assinatura de `listarArtigosPublicados(categoriaSlug)` e `listarCategorias()` (Task 5) consistente com o uso em `web/app/blog/page.js` (mesma task) e `buscarArtigoAdmin`/`ArtigoForm` (Task 6) usando `categoria_ids`/`categorias` (prop) sem conflito de nome.
