# Blog: Redesign, SEO, Imagens e Automação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela inicial e a página de artigo do blog, adicionar SEO (JSON-LD + Open Graph com imagem), suporte a imagem de capa e imagens no meio do texto, e uma rota autenticada pra automação de publicação via Claude.

**Architecture:** Editor existente (`ArtigoForm.js`, client component com `useActionState`) ganha upload de imagem via 2 novos elementos, reaproveitando o padrão de bucket de Storage já usado no diretório público (`perfis-publicos`). As páginas públicas do blog (`web/app/blog/page.js` e `[slug]/page.js`) ganham hierarquia visual e dados estruturados, sem mudar como o conteúdo é renderizado (`marked`, markdown → HTML). Uma rota nova (`POST /api/blog/artigos`) segue exatamente o padrão de `POST /api/agent/call-tool` (segredo compartilhado em header, `createAdminClient()`).

**Tech Stack:** Next.js 16 App Router (Server Actions, Route Handlers), Supabase (Postgres + Storage + RLS), `marked` (markdown → HTML, já em uso).

**Spec:** `docs/superpowers/specs/2026-08-25-blog-redesign-seo-imagens-design.md`

## Global Constraints

- Editor de imagem: opção A da spec — textarea markdown + botão de upload que insere `![](url)`, sem editor rico/WYSIWYG novo.
- Nova coluna `artigos.imagem_capa` (text, nullable) — nenhuma coluna/tabela nova pra imagens do meio do texto (só markdown em `conteudo`).
- Bucket de Storage novo `artigos-imagens`, público pra leitura, escrita restrita a quem já pode escrever em `artigos` hoje: `public.is_admin() or exists (select 1 from "Usuarios" u where u.id_user = auth.uid() and u.criador_conteudo = true)` — mesmo predicado exato da policy `artigos_admin_write` (`supabase/migrations/20260806000001_add_criador_conteudo.sql:8-22`).
- Caminho da capa: `<slug>/capa.<ext>` (upsert). Caminho de imagem no meio do texto: `<slug>/<timestamp>.<ext>`.
- **`sitemap.xml` e `robots.txt` já existem e já incluem os artigos publicados** (`web/app/sitemap.js`, `web/app/robots.js`) — não fazem parte deste plano, só confirmados como já corretos na Task 5.
- Rota nova `POST /api/blog/artigos` precisa ser adicionada a `PUBLIC_PATHS` em `web/lib/supabase/proxy.js` — sem isso a rota fica bloqueada pelo middleware de sessão (erro já cometido uma vez nesta sessão com a rota do agente de WhatsApp).
- Nova env var: `BLOG_API_SECRET`.
- Sem framework de teste automatizado (convenção já estabelecida no projeto) — verificação por script direto/curl contra produção, mesmo padrão já usado no restante do projeto.
- Paleta/tipografia: reaproveitar tokens já existentes em `web/app/globals.css` (`--color-navy`, `--color-primary`, `--color-primary-dark`, `--color-muted`, `--color-border`, `--color-surface`, `--font-display` = Sora, `--font-sans` = Inter) — nenhuma cor nova.

---

## Arquivos deste plano

- Modificar: `supabase/migrations/` (nova migration).
- Modificar: `web/lib/actions/artigos.js` (upload de capa em `criarArtigo`/`atualizarArtigo`, nova `fazerUploadImagemArtigo`).
- Modificar: `web/lib/data/artigos.js` (`listarArtigosPublicados` passa a trazer `conteudo` e `imagem_capa`; `buscarArtigoPublicadoPorSlug` passa a trazer `imagem_capa`; `buscarArtigoAdmin` passa a trazer `imagem_capa`).
- Modificar: `web/components/ArtigoForm.js` (campo de capa + botão de inserir imagem no texto).
- Criar: `web/lib/tempo-leitura.js` (helper de estimativa de tempo de leitura).
- Modificar: `web/app/blog/page.js` (redesign: destaque + grade).
- Modificar: `web/app/blog/[slug]/page.js` (capa, tempo de leitura, JSON-LD, Open Graph com imagem).
- Modificar: `web/app/globals.css` (estilo de imagem dentro de `.article-content`, classes novas pro redesign da lista).
- Criar: `web/app/api/blog/artigos/route.js` (rota de automação).
- Modificar: `web/lib/supabase/proxy.js` (`PUBLIC_PATHS`).
- Modificar: `docs/status-implementacao.md` (documentar `BLOG_API_SECRET`, mesmo formato de `AGENT_TOOL_SECRET`/`CARNE_LEAO_CRON_SECRET`).

---

### Task 1: Migration — coluna `imagem_capa` + bucket `artigos-imagens`

**Files:**
- Create: `supabase/migrations/20260825000001_add_imagem_capa_artigos.sql`

**Interfaces:**
- Produces: coluna `public.artigos.imagem_capa` (text, nullable) — consumida pelas Tasks 2, 3, 4, 5, 6.
- Produces: bucket `artigos-imagens` no Storage, com as 4 policies de objeto (`select`/`insert`/`update`/`delete`) — consumido pela Task 2.

- [ ] **Step 1: Escrever a migration**

```sql
-- Coluna de capa do artigo + bucket de Storage pra imagens do blog
-- (capa + imagens inseridas no meio do texto). Escrita restrita a quem
-- já pode escrever em "artigos" hoje (admin ou criador_conteudo) —
-- mesmo predicado da policy artigos_admin_write.
alter table public.artigos add column imagem_capa text;

insert into storage.buckets (id, name, public)
values ('artigos-imagens', 'artigos-imagens', true)
on conflict (id) do nothing;

create policy "artigosimagens_select_todos" on storage.objects
  for select using (bucket_id = 'artigos-imagens');

create policy "artigosimagens_insert_autor" on storage.objects
  for insert with check (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );

create policy "artigosimagens_update_autor" on storage.objects
  for update using (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );

create policy "artigosimagens_delete_autor" on storage.objects
  for delete using (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );
```

- [ ] **Step 2: Aplicar contra produção**

```bash
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const fs = await import('fs');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260825000001_add_imagem_capa_artigos.sql', 'utf8');
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
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const col = await client.query(\"select column_name from information_schema.columns where table_name = 'artigos' and column_name = 'imagem_capa'\");
  console.log('coluna imagem_capa existe:', col.rows.length === 1);
  const bucket = await client.query(\"select id, public from storage.buckets where id = 'artigos-imagens'\");
  console.log('bucket artigos-imagens:', bucket.rows);
  const policies = await client.query(\"select policyname from pg_policies where tablename = 'objects' and policyname like 'artigosimagens%'\");
  console.log('policies criadas:', policies.rows.length, '(esperado 4)');
  await client.end();
});
"
```

Expected: `coluna imagem_capa existe: true`, bucket com `public: true`, `policies criadas: 4`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260825000001_add_imagem_capa_artigos.sql
git commit -m "feat: adiciona coluna imagem_capa e bucket artigos-imagens"
```

---

### Task 2: Server actions de upload de imagem

**Files:**
- Modify: `web/lib/actions/artigos.js`

**Interfaces:**
- Consumes: `normalizarSlug` de `web/lib/slugify.js` (já existe).
- Produces: `fazerUploadImagemArtigo(slugArtigo, formData)` — server action, espera `formData.get("imagem")` (File), retorna `{url}` em sucesso ou `{error}` em falha. Consumida pela Task 3 (botão "Inserir imagem no texto").
- Produces: `criarArtigo`/`atualizarArtigo` (assinatura inalterada — continuam `(prevState, formData)` e `(id, prevState, formData)`) passam a ler `formData.get("imagem_capa")` (File, opcional) e `formData.get("remover_capa")` ("on" ou ausente) — consumidas pela Task 3.

- [ ] **Step 1: Adicionar `fazerUploadImagemArtigo`**

```js
export async function fazerUploadImagemArtigo(slugArtigo, formData) {
  const supabase = await createClient();
  const arquivo = formData.get("imagem");

  if (!arquivo || arquivo.size === 0) {
    return { error: "Nenhuma imagem selecionada." };
  }

  const slugNormalizado = normalizarSlug(slugArtigo);
  if (!slugNormalizado) {
    return { error: "Preencha o slug do artigo antes de inserir uma imagem." };
  }

  const extensao = arquivo.type.split("/")[1] || "png";
  const caminho = `${slugNormalizado}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("artigos-imagens")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

  if (erroUpload) {
    return { error: "Não foi possível enviar a imagem." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("artigos-imagens").getPublicUrl(caminho);

  return { url: publicUrl };
}
```

- [ ] **Step 2: Extrair o upload de capa pra uma função interna reaproveitada por `criarArtigo` e `atualizarArtigo`**

```js
async function resolverImagemCapa(supabase, slugNormalizado, formData, capaAtual) {
  const removerCapa = formData.get("remover_capa") === "on";
  if (removerCapa) return null;

  const arquivoCapa = formData.get("imagem_capa");
  if (!arquivoCapa || arquivoCapa.size === 0) {
    return capaAtual ?? null;
  }

  const extensao = arquivoCapa.type.split("/")[1] || "png";
  const caminho = `${slugNormalizado}/capa.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("artigos-imagens")
    .upload(caminho, arquivoCapa, { upsert: true, contentType: arquivoCapa.type });

  if (erroUpload) {
    throw new Error("Não foi possível enviar a imagem de capa.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("artigos-imagens").getPublicUrl(caminho);

  return `${publicUrl}?v=${Date.now()}`;
}
```

- [ ] **Step 3: Usar `resolverImagemCapa` em `criarArtigo`**

Modificar o corpo de `criarArtigo` (`web/lib/actions/artigos.js`, função já existente) — trocar o bloco `const { error } = await supabase.from("artigos").insert({...})` por:

```js
export async function criarArtigo(prevState, formData) {
  const supabase = await createClient();

  const publicado = formData.get("publicado") === "on";
  const slugNormalizado = normalizarSlug(formData.get("slug"));

  let imagemCapa;
  try {
    imagemCapa = await resolverImagemCapa(supabase, slugNormalizado, formData, null);
  } catch (e) {
    return { error: e.message };
  }

  const { error } = await supabase.from("artigos").insert({
    titulo: formData.get("titulo"),
    slug: slugNormalizado,
    resumo: formData.get("resumo") || null,
    conteudo: formData.get("conteudo"),
    autor: formData.get("autor") || null,
    imagem_capa: imagemCapa,
    publicado,
    publicado_em: publicado ? new Date().toISOString() : null,
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
}
```

- [ ] **Step 4: Usar `resolverImagemCapa` em `atualizarArtigo`**

Modificar `atualizarArtigo` (função já existente) pra buscar `imagem_capa` também no select atual e passar pro helper:

```js
export async function atualizarArtigo(id, prevState, formData) {
  const supabase = await createClient();

  const { data: atual, error: erroAtual } = await supabase
    .from("artigos")
    .select("publicado, publicado_em, slug, imagem_capa")
    .eq("id", id)
    .single();

  if (erroAtual) {
    return { error: "Não foi possível carregar o artigo." };
  }

  const publicado = formData.get("publicado") === "on";
  const publicadoEm = publicado ? atual.publicado_em ?? new Date().toISOString() : null;
  const slugNormalizado = normalizarSlug(formData.get("slug"));

  let imagemCapa;
  try {
    imagemCapa = await resolverImagemCapa(supabase, slugNormalizado, formData, atual.imagem_capa);
  } catch (e) {
    return { error: e.message };
  }

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
}
```

- [ ] **Step 5: Verificar contra produção**

Criar um artigo de teste via script direto simulando o fluxo (sem passar por UI ainda, já que a Task 3 constrói a UI):

```bash
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const cols = await client.query(\"select column_name from information_schema.columns where table_name = 'artigos' order by ordinal_position\");
  console.log(cols.rows.map(r => r.column_name));
  await client.end();
});
"
```

Expected: a lista de colunas inclui `imagem_capa`. (A verificação funcional completa do upload acontece na Task 3, testando pela UI real — este passo só confirma que o schema está pronto pro código novo.)

- [ ] **Step 6: Commit**

```bash
git add web/lib/actions/artigos.js
git commit -m "feat: adiciona upload de imagem de capa e de imagem no texto do artigo"
```

---

### Task 3: Editor — upload de capa e inserir imagem no texto

**Files:**
- Modify: `web/components/ArtigoForm.js`

**Interfaces:**
- Consumes: `fazerUploadImagemArtigo` (Task 2), `normalizarSlug` de `web/lib/slugify.js`.
- Consumes: prop `artigo` já existente ganha o campo `imagem_capa` (vem de `buscarArtigoAdmin`, ajustado no Step 3 desta task).

- [ ] **Step 1: Ajustar `buscarArtigoAdmin` pra trazer `imagem_capa`**

Em `web/lib/data/artigos.js`, mudar o `.select(...)` de `buscarArtigoAdmin`:

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

- [ ] **Step 2: Adicionar campo de capa e botão de inserir imagem no `ArtigoForm.js`**

Reescrever `web/components/ArtigoForm.js` (arquivo inteiro — é pequeno e a mudança toca quase todo ele):

```js
"use client";

import { useActionState, useRef, useState } from "react";
import { fazerUploadImagemArtigo } from "@/lib/actions/artigos";
import { normalizarSlug } from "@/lib/slugify";

const estadoInicial = {};

export default function ArtigoForm({ action, artigo }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [previewCapa, setPreviewCapa] = useState(artigo?.imagem_capa ?? null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState(null);
  const conteudoRef = useRef(null);
  const slugRef = useRef(null);
  const inputImagemTextoRef = useRef(null);

  function handleCapaChange(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setPreviewCapa(URL.createObjectURL(arquivo));
  }

  async function handleInserirImagem(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    const slugAtual = normalizarSlug(slugRef.current?.value || "");
    if (!slugAtual) {
      setErroImagem("Preencha o slug do artigo antes de inserir uma imagem no texto.");
      e.target.value = "";
      return;
    }

    setErroImagem(null);
    setEnviandoImagem(true);

    const formData = new FormData();
    formData.set("imagem", arquivo);
    const resultado = await fazerUploadImagemArtigo(slugAtual, formData);

    setEnviandoImagem(false);
    e.target.value = "";

    if (resultado.error) {
      setErroImagem(resultado.error);
      return;
    }

    const textarea = conteudoRef.current;
    const inicio = textarea.selectionStart ?? textarea.value.length;
    const fim = textarea.selectionEnd ?? textarea.value.length;
    const trecho = `\n![](${resultado.url})\n`;
    textarea.value = textarea.value.slice(0, inicio) + trecho + textarea.value.slice(fim);
    const novaPosicao = inicio + trecho.length;
    textarea.setSelectionRange(novaPosicao, novaPosicao);
    textarea.focus();
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-4 card p-6">
      <div>
        <label htmlFor="titulo" className="block text-sm font-semibold text-navy">
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          type="text"
          required
          defaultValue={artigo?.titulo}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-semibold text-navy">
          Slug (URL)
        </label>
        <input
          id="slug"
          name="slug"
          ref={slugRef}
          type="text"
          required
          placeholder="ex: como-lidar-com-ansiedade"
          defaultValue={artigo?.slug}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="resumo" className="block text-sm font-semibold text-navy">
          Resumo (opcional)
        </label>
        <textarea
          id="resumo"
          name="resumo"
          rows={2}
          defaultValue={artigo?.resumo}
          className="field"
        />
      </div>

      <div>
        <span className="block text-sm font-semibold text-navy">Imagem de capa (opcional)</span>
        {previewCapa && (
          <img
            src={previewCapa}
            alt="Prévia da capa"
            className="mt-2 h-40 w-full rounded-xl object-cover"
          />
        )}
        <input
          id="imagem_capa"
          name="imagem_capa"
          type="file"
          accept="image/*"
          onChange={handleCapaChange}
          className="field mt-2"
        />
        {previewCapa && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              name="remover_capa"
              onChange={(e) => e.target.checked && setPreviewCapa(null)}
              className="h-4 w-4"
            />
            Remover capa atual
          </label>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="conteudo" className="block text-sm font-semibold text-navy">
            Conteúdo (Markdown)
          </label>
          <label className="link cursor-pointer text-sm">
            {enviandoImagem ? "Enviando..." : "+ Inserir imagem no texto"}
            <input
              ref={inputImagemTextoRef}
              type="file"
              accept="image/*"
              onChange={handleInserirImagem}
              disabled={enviandoImagem}
              className="hidden"
            />
          </label>
        </div>
        {erroImagem && <p className="text-sm text-red-600">{erroImagem}</p>}
        <textarea
          id="conteudo"
          name="conteudo"
          ref={conteudoRef}
          required
          rows={16}
          defaultValue={artigo?.conteudo}
          className="field font-mono"
        />
      </div>

      <div>
        <label htmlFor="autor" className="block text-sm font-semibold text-navy">
          Autor (opcional)
        </label>
        <input
          id="autor"
          name="autor"
          type="text"
          defaultValue={artigo?.autor}
          className="field"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="publicado"
          name="publicado"
          type="checkbox"
          defaultChecked={artigo?.publicado}
          className="h-4 w-4"
        />
        <label htmlFor="publicado" className="text-sm font-semibold text-navy">
          Publicar agora
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar artigo"}
      </button>
    </form>
  );
}
```

Nota: o `textarea` de conteúdo usa `defaultValue` (não controlado por `useState`), então editar `textarea.value` diretamente via `ref` (como `handleInserirImagem` faz) é seguro — é exatamente o padrão de campo não-controlado do React, sem conflito de re-render.

- [ ] **Step 3: Testar manualmente (build + preview, nunca `next dev`)**

```bash
cd web
npm run build
```

Depois, com o preview local rodando (`node .next/standalone/server.js`, com `public/` e `.next/static/` copiados pra dentro de `.next/standalone/`, mesmo processo já usado no projeto): acessar `/admin/artigos/novo`, preencher título/slug, fazer upload de uma imagem de capa (confirmar preview aparece), clicar "+ Inserir imagem no texto" e confirmar que `![](url)` aparece no textarea na posição do cursor, salvar o artigo, e confirmar em `/admin/artigos/[id]/editar` que a capa salva aparece pré-carregada.

- [ ] **Step 4: Commit**

```bash
git add web/components/ArtigoForm.js web/lib/data/artigos.js
git commit -m "feat: adiciona upload de capa e insercao de imagem no editor de artigo"
```

---

### Task 4: Redesign da tela inicial do blog

**Files:**
- Create: `web/lib/tempo-leitura.js`
- Modify: `web/app/blog/page.js`
- Modify: `web/lib/data/artigos.js` (`listarArtigosPublicados`)
- Modify: `web/app/globals.css`

**Interfaces:**
- Produces: `calcularTempoLeitura(texto)` retorna `number` (minutos, arredondado pra cima, mínimo 1) — consumida pela Task 5 também.
- Consumes: `listarArtigosPublicados()` passa a retornar também `conteudo` e `imagem_capa` por artigo.

- [ ] **Step 1: Criar o helper de tempo de leitura**

```js
// web/lib/tempo-leitura.js
export function calcularTempoLeitura(texto) {
  if (!texto) return 1;
  const palavras = texto.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(palavras / 200));
}
```

- [ ] **Step 2: Ajustar `listarArtigosPublicados` pra trazer `conteudo` e `imagem_capa`**

```js
export async function listarArtigosPublicados() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, conteudo, autor, publicado_em, imagem_capa")
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 3: Adicionar estilos novos em `globals.css`** (dentro do `@layer components` já existente)

```css
  .blog-hero {
    display: block;
    border-radius: 1.25rem;
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-navy);
    position: relative;
  }

  .blog-hero-img {
    width: 100%;
    height: 20rem;
    object-fit: cover;
    display: block;
  }

  .blog-hero-fallback {
    width: 100%;
    height: 20rem;
    background: linear-gradient(135deg, var(--color-navy), var(--color-primary-dark));
  }

  .blog-hero-body {
    padding: 1.5rem 1.75rem 1.75rem;
    background: var(--color-surface);
  }

  .blog-card-img {
    width: 100%;
    height: 10rem;
    object-fit: cover;
    display: block;
  }

  .blog-card-fallback {
    width: 100%;
    height: 10rem;
    background: linear-gradient(135deg, var(--color-navy), var(--color-primary-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .blog-card-fallback span {
    color: #ffffff;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.95rem;
    text-align: center;
  }

  .blog-meta {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .article-content img {
    width: 100%;
    border-radius: 0.75rem;
    margin: 1.5rem 0;
  }
```

- [ ] **Step 4: Reescrever `web/app/blog/page.js`**

```js
import Link from "next/link";
import { listarArtigosPublicados } from "@/lib/data/artigos";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

export default async function PaginaBlog() {
  const artigos = await listarArtigosPublicados();

  if (artigos.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Blog</h1>
        <p className="empty-state">Nenhum artigo publicado ainda.</p>
      </div>
    );
  }

  const [destaque, ...restantes] = artigos;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="page-title mb-6">Blog</h1>

        <Link href={`/${destaque.slug}`} className="blog-hero">
          {destaque.imagem_capa ? (
            <img src={destaque.imagem_capa} alt={destaque.titulo} className="blog-hero-img" />
          ) : (
            <div className="blog-hero-fallback" />
          )}
          <div className="blog-hero-body">
            <p className="blog-meta">
              {new Date(destaque.publicado_em).toLocaleDateString("pt-BR")}
              {destaque.autor && ` · ${destaque.autor}`}
              {` · ${calcularTempoLeitura(destaque.conteudo)} min de leitura`}
            </p>
            <h2 className="font-display text-2xl font-bold text-navy mt-2">{destaque.titulo}</h2>
            {destaque.resumo && <p className="text-muted mt-2">{destaque.resumo}</p>}
          </div>
        </Link>
      </div>

      {restantes.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
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
    </div>
  );
}
```

- [ ] **Step 5: Testar (build + preview)**

```bash
cd web
npm run build
```

Com o preview local rodando, acessar `/blog` (ou o path equivalente conforme o roteamento de subdomínio deste projeto) e confirmar: o artigo mais recente aparece em destaque grande, os outros 2 aparecem em grade, todos sem capa (os 3 artigos publicados na sessão anterior não têm `imagem_capa` ainda) mostrando o fallback em gradiente petróleo/âmbar com o título legível em branco.

- [ ] **Step 6: Commit**

```bash
git add web/lib/tempo-leitura.js web/app/blog/page.js web/lib/data/artigos.js web/app/globals.css
git commit -m "feat: redesenha tela inicial do blog com destaque, grade e tempo de leitura"
```

---

### Task 5: Página do artigo — capa, tempo de leitura, SEO

**Files:**
- Modify: `web/app/blog/[slug]/page.js`
- Modify: `web/lib/data/artigos.js` (`buscarArtigoPublicadoPorSlug`)

**Interfaces:**
- Consumes: `calcularTempoLeitura` (Task 4).
- Consumes: `buscarArtigoPublicadoPorSlug()` passa a retornar também `imagem_capa` e `atualizado_em`.

- [ ] **Step 1: Ajustar `buscarArtigoPublicadoPorSlug`**

```js
export async function buscarArtigoPublicadoPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artigos")
    .select("id, titulo, slug, resumo, conteudo, autor, publicado_em, atualizado_em, imagem_capa")
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Reescrever `web/app/blog/[slug]/page.js`**

```js
import { notFound } from "next/navigation";
import { marked } from "marked";
import { buscarArtigoPublicadoPorSlug } from "@/lib/data/artigos";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) return {};

  const origem = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const url = `${origem}/${artigo.slug}`;
  const imagens = artigo.imagem_capa ? [{ url: artigo.imagem_capa }] : undefined;

  return {
    title: artigo.titulo,
    description: artigo.resumo ?? undefined,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: artigo.titulo,
      description: artigo.resumo ?? undefined,
      type: "article",
      url,
      images: imagens,
    },
  };
}

export default async function PaginaArtigo({ params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);

  if (!artigo) {
    notFound();
  }

  const html = marked.parse(artigo.conteudo);
  const tempoLeitura = calcularTempoLeitura(artigo.conteudo);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: artigo.titulo,
    description: artigo.resumo ?? undefined,
    image: artigo.imagem_capa ?? undefined,
    datePublished: artigo.publicado_em,
    dateModified: artigo.atualizado_em ?? artigo.publicado_em,
    author: artigo.autor ? { "@type": "Person", name: artigo.autor } : undefined,
  };

  return (
    <article className="space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {artigo.imagem_capa && (
        <img
          src={artigo.imagem_capa}
          alt={artigo.titulo}
          className="w-full h-64 object-cover rounded-2xl"
        />
      )}

      <div>
        <p className="text-xs text-muted">
          {new Date(artigo.publicado_em).toLocaleDateString("pt-BR")}
          {artigo.autor && ` · ${artigo.autor}`}
          {` · ${tempoLeitura} min de leitura`}
        </p>
        <h1 className="page-title mt-1">{artigo.titulo}</h1>
      </div>

      <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

- [ ] **Step 3: Confirmar que `sitemap.xml` e `robots.txt` já cobrem o blog (nenhuma mudança de código, só verificação)**

```bash
curl -s "https://psiagente.com.br/sitemap.xml" | grep -c "blog.psiagente.com.br"
curl -s "https://blog.psiagente.com.br/robots.txt"
```

Expected: a contagem do primeiro comando é `>= 4` (a home do blog + os 3 artigos já publicados), e o segundo mostra `Allow: /` com a linha `Sitemap:` apontando pro `sitemap.xml` — confirmando que `web/app/sitemap.js` e `web/app/robots.js` (já existentes, não tocados neste plano) já cobrem o blog corretamente.

- [ ] **Step 4: Testar (build + preview)**

```bash
cd web
npm run build
```

Com o preview local rodando: abrir um dos 3 artigos publicados, confirmar que o layout mostra tempo de leitura, e usar "Ver código-fonte" do navegador (ou `curl localhost:3000/<slug>`) pra confirmar que a tag `<script type="application/ld+json">` está presente com `headline`/`datePublished` corretos.

- [ ] **Step 5: Commit**

```bash
git add web/app/blog/[slug]/page.js web/lib/data/artigos.js
git commit -m "feat: adiciona capa, tempo de leitura e dados estruturados na pagina do artigo"
```

---

### Task 6: Rota de automação `POST /api/blog/artigos`

**Files:**
- Create: `web/app/api/blog/artigos/route.js`
- Modify: `web/lib/supabase/proxy.js`

**Interfaces:**
- Consumes: `createAdminClient` de `web/lib/supabase/admin.js`, `normalizarSlug` de `web/lib/slugify.js`.
- Produces: `POST /api/blog/artigos`, autenticado por header `x-blog-secret` contra `process.env.BLOG_API_SECRET`. Body: `{titulo, slug, resumo?, conteudo, autor?, publicado?, imagem_capa_url?}`. Resposta: `{success: true, data, acao: "criado"|"atualizado"}` ou `{success: false, error_code}`.

- [ ] **Step 1: Criar a rota**

```js
// web/app/api/blog/artigos/route.js
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarSlug } from "@/lib/slugify";

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

  if (!titulo || !slug || !conteudo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  const slugNormalizado = normalizarSlug(slug);
  const dados = {
    titulo,
    slug: slugNormalizado,
    resumo: resumo ?? null,
    conteudo,
    autor: autor ?? null,
    publicado: publicado ?? false,
    imagem_capa: imagem_capa_url ?? null,
  };

  const { data: existente } = await admin
    .from("artigos")
    .select("id, publicado_em")
    .eq("slug", slugNormalizado)
    .maybeSingle();

  if (existente) {
    if (dados.publicado && !existente.publicado_em) {
      dados.publicado_em = new Date().toISOString();
    }
    const { data, error } = await admin
      .from("artigos")
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq("id", existente.id)
      .select()
      .single();
    if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
    return Response.json({ success: true, data, acao: "atualizado" });
  }

  if (dados.publicado) dados.publicado_em = new Date().toISOString();
  const { data, error } = await admin.from("artigos").insert(dados).select().single();
  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ success: true, data, acao: "criado" });
}
```

- [ ] **Step 2: Liberar a rota em `PUBLIC_PATHS`**

Em `web/lib/supabase/proxy.js`, adicionar `"/api/blog/artigos"` ao array `PUBLIC_PATHS` (mesma lista que já tem `"/api/agent/call-tool"` e `"/carne-leao-automatico"`):

```js
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
  "/carne-leao-automatico",
  "/api/agent/call-tool",
  "/api/blog/artigos",
];
```

- [ ] **Step 3: Gerar e configurar `BLOG_API_SECRET`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Configurar essa string como env var `BLOG_API_SECRET` no serviço `psifacil_psifacil` no EasyPanel (mesmo processo já usado pra `AGENT_TOOL_SECRET`/`CARNE_LEAO_CRON_SECRET`) — ação do usuário, não automatizável por SSH neste projeto (sem acesso à API/dashboard do EasyPanel).

- [ ] **Step 4: Testar contra produção (depois do deploy)**

```bash
BLOG_SECRET="<o segredo gerado no Step 3>"
curl -s -X POST "https://psiagente.com.br/api/blog/artigos" \
  -H "Content-Type: application/json" \
  -H "x-blog-secret: $BLOG_SECRET" \
  -d '{"titulo":"Artigo de teste (apagar)","slug":"artigo-de-teste-apagar","conteudo":"Conteúdo de teste.","publicado":false}'
```

Expected: `{"success":true,"data":{...},"acao":"criado"}`. Testar de novo com o mesmo slug pra confirmar `"acao":"atualizado"`. Testar sem o header `x-blog-secret` e confirmar `401`. Depois, apagar a linha de teste:

```bash
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(\"delete from artigos where slug = 'artigo-de-teste-apagar'\");
  console.log('Artigo de teste apagado.');
  await client.end();
});
"
```

- [ ] **Step 5: Commit**

```bash
git add web/app/api/blog/artigos/route.js web/lib/supabase/proxy.js
git commit -m "feat: adiciona rota de automacao POST /api/blog/artigos"
```

---

### Task 7: Documentação

**Files:**
- Modify: `docs/status-implementacao.md`

**Interfaces:**
- Nenhuma — task de documentação, não produz interface pra outra task.

- [ ] **Step 1: Documentar `BLOG_API_SECRET`**

Em `docs/status-implementacao.md`, adicionar uma seção sobre a rota `POST /api/blog/artigos` mirando exatamente o formato já usado pra `AGENT_TOOL_SECRET` (3 lugares: gerar, configurar no EasyPanel, usar no header da chamada) — incluir o exemplo de `curl` do Task 6 Step 4 como referência de uso.

- [ ] **Step 2: Commit**

```bash
git add docs/status-implementacao.md
git commit -m "docs: documenta rota de automacao do blog e BLOG_API_SECRET"
```

---

## Self-Review

**Cobertura da spec:** redesign da tela inicial (Task 4), SEO — JSON-LD + OG image (Task 5; sitemap/robots já existiam, confirmados na Task 5 Step 3), imagem de capa + imagem no meio do texto (Tasks 1-3), rota de automação + lembrete de `PUBLIC_PATHS` (Task 6) — todas as seções da spec têm task correspondente.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo e literal, inclusive os textos de erro e os estilos CSS.

**Consistência de tipos:** `calcularTempoLeitura(texto)` (Task 4) usado identicamente na Task 5. `imagem_capa` como nome de coluna/campo consistente em todas as tasks (migration, actions, data layer, componentes, rota de automação — lá como `imagem_capa_url` no payload de entrada, mas gravado na mesma coluna `imagem_capa`, documentado explicitamente na Task 6). Predicado de RLS da Task 1 copiado literalmente da migration `20260806000001` já existente, não reinventado.
