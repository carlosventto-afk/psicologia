# Diretório Público de Psicólogos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o diretório público (`busca.psifacil.com.br`) onde
pacientes encontram psicólogos cadastrados por especialidade/cidade/
modalidade e falam com eles direto pelo WhatsApp, com o psicólogo
controlando sua própria visibilidade e recebendo um indicador de contatos.

**Architecture:** Extensão do app Next.js já existente (mesmo padrão de
subdomínio já provado em `blog.` e `comece.`, mesmo padrão de RLS/CRUD já
usado em todo o app). Tabela nova `PerfilPublico` (1:1 com `Usuarios`)
separada por segurança de RLS, mais `Especialidade`, `PerfilEspecialidade`
e `ContatoDiretorio`. Primeira vez que o projeto usa Supabase Storage.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions),
Supabase (Postgres + RLS + Storage), Tailwind v4 — nenhuma dependência nova.

## Global Constraints

- Este projeto **não tem suíte de testes automatizados** (sem
  Jest/Vitest/etc. em `web/package.json`) — a verificação estabelecida em
  todo o histórico do projeto é: `npm run build` (pega erro de sintaxe/tipo/
  import), consulta SQL direta via `psql`/`pg` (pega erro de RLS/schema), e
  teste manual local com `curl -H "Host: <subdominio>.localhost:3000"` +
  navegador (chrome-devtools MCP) antes de subir. Cada task abaixo usa esse
  mesmo ciclo em vez de "escreva o teste, rode, veja falhar" — é a
  adaptação correta do processo TDD padrão pra um projeto sem suíte de
  testes; não introduzir um framework de testes novo como efeito colateral
  desta feature.
- Seguir exatamente os padrões já estabelecidos no código: Server Actions
  com `"use server"` + `(prevState, formData)` + `useActionState` no
  client; data layer em `web/lib/data/*.js` sempre usando
  `createClient()` de `@/lib/supabase/server` (nunca o client
  service-role, que é reservado só pra Auth Admin API); classes CSS
  existentes (`.field`, `.btn-primary`, `.btn-outline`, `.card`,
  `.empty-state`, `.page-title`, `text-navy`, `text-muted`) — não criar
  classes globais novas.
- Toda migration aplicada via o mesmo script inline `node -e` com `pg`
  que já foi usado nas migrations anteriores desta sessão (ver Task 1) —
  não existe Supabase CLI funcional neste ambiente.
- Commits em português, seguindo o estilo já usado no histórico do repo
  (`git log` pra referência de tom).

---

### Task 1: Migration — tabelas, RLS e bucket de Storage

**Files:**
- Create: `supabase/migrations/20260803000003_add_diretorio_publico.sql`

**Interfaces:**
- Produces: tabelas `public."PerfilPublico"`, `public."Especialidade"`,
  `public."PerfilEspecialidade"`, `public."ContatoDiretorio"`; bucket de
  Storage `perfis-publicos`. Todas as tasks seguintes dependem deste
  schema exato.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- Diretório público de psicólogos (item 2 do backlog). PerfilPublico é
-- separado de Usuarios de propósito: Usuarios não tem policy de leitura
-- pública hoje (só id_user = auth.uid() or is_admin()), então uma tabela
-- própria com policy estreita evita vazar campo sensível (e-mail, role)
-- por engano.
create table public."PerfilPublico" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null unique references "Usuarios"(id) on delete cascade,
  slug text not null unique,
  bio text,
  foto_url text,
  cidade text,
  estado text,
  valor_sessao numeric,
  modalidade text not null default 'ambos'
    check (modalidade in ('presencial', 'online', 'ambos')),
  visivel_diretorio boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public."Especialidade" (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table public."PerfilEspecialidade" (
  perfil_id uuid not null references "PerfilPublico"(id) on delete cascade,
  especialidade_id uuid not null references "Especialidade"(id) on delete cascade,
  primary key (perfil_id, especialidade_id)
);

create table public."ContatoDiretorio" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references "Usuarios"(id) on delete cascade,
  criado_em timestamptz not null default now(),
  origem text not null default 'perfil'
);

-- RLS: PerfilPublico
alter table public."PerfilPublico" enable row level security;

-- Público só vê perfil de quem está visível E aprovado (fecha um gap: sem
-- o "and aprovado", um autocadastro pendente poderia se tornar visível
-- publicamente antes de ser aprovado pelo admin, o que contraria o
-- propósito do aprovado do item 3).
create policy "perfilpublico_select_publico" on public."PerfilPublico"
  for select using (
    (
      visivel_diretorio = true
      and exists (
        select 1 from "Usuarios" u
        where u.id = usuario_id and u.aprovado = true
      )
    )
    or exists (
      select 1 from "Usuarios" u
      where u.id = usuario_id and u.id_user = auth.uid()
    )
    or public.is_admin()
  );

create policy "perfilpublico_write_dono" on public."PerfilPublico"
  for insert with check (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

create policy "perfilpublico_update_dono" on public."PerfilPublico"
  for update using (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  ) with check (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

-- RLS: Especialidade (lista de referência, leitura livre pra anon e authenticated)
alter table public."Especialidade" enable row level security;

create policy "especialidade_select_todos" on public."Especialidade"
  for select using (true);

-- RLS: PerfilEspecialidade (acompanha a visibilidade do PerfilPublico relacionado)
alter table public."PerfilEspecialidade" enable row level security;

create policy "perfilespecialidade_select_publico" on public."PerfilEspecialidade"
  for select using (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id
        and (
          (p.visivel_diretorio = true and u.aprovado = true)
          or u.id_user = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy "perfilespecialidade_write_dono" on public."PerfilEspecialidade"
  for all using (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id and (u.id_user = auth.uid() or public.is_admin())
    )
  ) with check (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id and (u.id_user = auth.uid() or public.is_admin())
    )
  );

-- RLS: ContatoDiretorio (visitante grava, só o dono/admin lê)
alter table public."ContatoDiretorio" enable row level security;

create policy "contatodiretorio_insert_todos" on public."ContatoDiretorio"
  for insert with check (true);

create policy "contatodiretorio_select_dono" on public."ContatoDiretorio"
  for select using (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

-- Seed inicial de especialidades (lista fixa, sem UI de admin pra
-- gerenciar — mesmo padrão de TipoAtendimento/TipoCobranca).
insert into public."Especialidade" (nome) values
  ('Terapia Cognitivo-Comportamental (TCC)'),
  ('Psicanálise'),
  ('Terapia Humanista'),
  ('Gestalt-terapia'),
  ('Terapia Sistêmica/Familiar'),
  ('Terapia de Casal'),
  ('Ansiedade'),
  ('Depressão'),
  ('Luto'),
  ('Transtornos Alimentares'),
  ('TDAH'),
  ('Autismo/Neurodivergência'),
  ('Dependência Química'),
  ('Psicologia Infantil'),
  ('Psicologia do Adolescente'),
  ('Psicologia Organizacional/Carreira'),
  ('Sexualidade'),
  ('Gênero e LGBTQIA+'),
  ('Trauma/TEPT');

-- Storage: bucket público de fotos de perfil (primeira vez que o projeto
-- usa Storage). Caminho de upload é sempre "<auth.uid()>/arquivo", então
-- a policy de escrita não precisa fazer join nenhum.
insert into storage.buckets (id, name, public)
values ('perfis-publicos', 'perfis-publicos', true)
on conflict (id) do nothing;

create policy "perfispublicos_select_todos" on storage.objects
  for select using (bucket_id = 'perfis-publicos');

create policy "perfispublicos_insert_dono" on storage.objects
  for insert with check (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "perfispublicos_update_dono" on storage.objects
  for update using (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "perfispublicos_delete_dono" on storage.objects
  for delete using (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Aplicar a migration no banco real**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const fs = require("fs");
const { Client } = require("pg");
(async () => {
  const sql = fs.readFileSync("supabase/migrations/20260803000003_add_diretorio_publico.sql", "utf8");
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Migration aplicada com sucesso.");
  } catch (err) {
    await client.query("rollback");
    console.error("ERRO:", err.message);
    process.exitCode = 1;
  }
  await client.end();
})();
'
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar que as tabelas e o seed existem**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select count(*) from "Especialidade"`);
  console.log("especialidades:", rows[0].count);
  const buckets = await client.query(`select id, public from storage.buckets where id = $1`, ["perfis-publicos"]);
  console.log("bucket:", JSON.stringify(buckets.rows));
  await client.end();
})();
'
```

Expected: `especialidades: 19` e o bucket aparecendo com `public: true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803000003_add_diretorio_publico.sql
git commit -m "Migration do diretório público: PerfilPublico, Especialidade, PerfilEspecialidade, ContatoDiretorio + bucket de Storage"
```

---

### Task 2: Extrair helper de slug compartilhado

**Files:**
- Create: `web/lib/slugify.js`
- Modify: `web/lib/actions/artigos.js:1-14`

**Interfaces:**
- Produces: `normalizarSlug(valor: string): string` exportado de
  `@/lib/slugify`.
- Consumes (Task 4): `normalizarSlug` será usado por
  `web/lib/actions/diretorio.js`.

- [ ] **Step 1: Criar `web/lib/slugify.js`**

```js
export function normalizarSlug(valor) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 2: Atualizar `web/lib/actions/artigos.js` pra importar em vez de definir local**

Remover as linhas 7-14 (a função `normalizarSlug` local) e adicionar o
import no topo do arquivo:

```js
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarSlug } from "@/lib/slugify";
```

O resto do arquivo (`criarArtigo`, `atualizarArtigo`) não muda — ambos já
chamam `normalizarSlug(...)`, só passam a usar a versão importada.

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro, rota `/admin/artigos/novo` continua listada.

- [ ] **Step 4: Commit**

```bash
git add web/lib/slugify.js web/lib/actions/artigos.js
git commit -m "Extrai normalizarSlug pra lib compartilhada (reaproveitado pelo diretório)"
```

---

### Task 3: Data layer do diretório

**Files:**
- Create: `web/lib/data/diretorio.js`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`; `normalizarIds`/
  `normalizarIdsLista` de `@/lib/normalizar-ids`.
- Produces:
  - `listarEspecialidades(): Promise<{id, nome}[]>`
  - `buscarPerfisPublicos(filtros: {especialidade?, cidade?, modalidade?, valorMax?}): Promise<{id, slug, nome, cidade, estado, modalidade, valor_sessao, foto_url, especialidades: string[]}[]>`
  - `buscarPerfilPorSlug(slug: string): Promise<{...} | null>`
  - `buscarMeuPerfil(): Promise<{...} | null>` (perfil do usuário logado, ou `null` se ainda não criou)
  - `contarMeusContatos(): Promise<number>`
- Todas as tasks de página (5, 7, 8) dependem destas funções.

- [ ] **Step 1: Escrever `web/lib/data/diretorio.js`**

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarEspecialidades() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Especialidade")
    .select("id, nome")
    .order("nome");

  if (error) throw new Error(error.message);
  return data;
}

export async function buscarPerfisPublicos(filtros = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("PerfilPublico")
    .select(
      `id, slug, cidade, estado, modalidade, valor_sessao, foto_url,
       Usuarios!inner(nome),
       PerfilEspecialidade(Especialidade(id, nome))`
    )
    .eq("visivel_diretorio", true)
    .order("criado_em", { ascending: false });

  if (filtros.cidade) {
    query = query.ilike("cidade", `%${filtros.cidade}%`);
  }
  if (filtros.modalidade) {
    query = query.in("modalidade", [filtros.modalidade, "ambos"]);
  }
  if (filtros.valorMax) {
    query = query.lte("valor_sessao", filtros.valorMax);
  }
  if (filtros.especialidade) {
    query = query.eq("PerfilEspecialidade.especialidade_id", filtros.especialidade);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, []).map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: p.Usuarios.nome,
    cidade: p.cidade,
    estado: p.estado,
    modalidade: p.modalidade,
    valor_sessao: p.valor_sessao,
    foto_url: p.foto_url,
    especialidades: (p.PerfilEspecialidade || []).map((pe) => pe.Especialidade.nome),
  }));
}

export async function buscarPerfilPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       Usuarios!inner(nome, crp, contato),
       PerfilEspecialidade(Especialidade(id, nome))`
    )
    .eq("slug", slug)
    .eq("visivel_diretorio", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    bio: data.bio,
    cidade: data.cidade,
    estado: data.estado,
    modalidade: data.modalidade,
    valor_sessao: data.valor_sessao,
    foto_url: data.foto_url,
    nome: data.Usuarios.nome,
    crp: data.Usuarios.crp,
    contato: data.Usuarios.contato,
    especialidades: (data.PerfilEspecialidade || []).map((pe) => pe.Especialidade),
  };
}

export async function buscarMeuPerfil() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       visivel_diretorio,
       PerfilEspecialidade(especialidade_id)`
    )
    .eq("Usuarios.id_user", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return normalizarIds(
    {
      ...data,
      especialidade_ids: (data.PerfilEspecialidade || []).map((pe) => pe.especialidade_id),
    },
    []
  );
}

export async function contarMeusContatos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: usuario } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .single();

  const { count, error } = await supabase
    .from("ContatoDiretorio")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario.id);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

**Nota:** `buscarMeuPerfil` usa `.eq("Usuarios.id_user", user.id)` num
relacionamento embutido — isso exige que `PerfilPublico` tenha uma FK
reconhecível pro PostgREST inferir o join implícito (já existe:
`usuario_id references "Usuarios"(id)`). Se o filtro por coluna
relacionada não funcionar direto nessa sintaxe, o fallback é buscar
primeiro `Usuarios.id` a partir de `user.id` (mesmo padrão usado em
`contarMeusContatos` acima) e depois `.eq("usuario_id", usuarioId)` — usar
esse fallback se o Step 2 de verificação abaixo não retornar o perfil
esperado.

- [ ] **Step 2: Verificar contra o banco real com um perfil de teste temporário**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows: usuarios } = await client.query(`select id from "Usuarios" limit 1`);
  const usuarioId = usuarios[0].id;
  const { rows: especialidades } = await client.query(`select id from "Especialidade" limit 2`);
  const { rows: perfil } = await client.query(
    `insert into "PerfilPublico" (usuario_id, slug, bio, cidade, estado, modalidade, valor_sessao, visivel_diretorio)
     values ($1, $2, $3, $4, $5, $6, $7, true) returning id`,
    [usuarioId, "teste-plano-diretorio", "Bio de teste", "São Paulo", "SP", "online", 150]
  );
  const perfilId = perfil[0].id;
  for (const e of especialidades) {
    await client.query(`insert into "PerfilEspecialidade" (perfil_id, especialidade_id) values ($1, $2)`, [perfilId, e.id]);
  }
  console.log("perfil de teste criado:", perfilId);
  await client.end();
})();
'
```

Rodar essas funções isoladamente via `node --experimental-vm-modules` não é
viável pra ESM do Next fora do runtime do framework — em vez disso, valide
aqui só com `npm run build` (Step 3), e o teste de comportamento de verdade
fica pras Tasks 7, 8 e 9, quando as páginas que chamam essas funções já
existem e podem ser exercitadas via `curl`/navegador. Depois desse smoke
test de dados, **não apague
ainda** o perfil de teste — ele é reaproveitado pra testar as páginas
públicas nas Tasks 7 e 8, e removido no Step de limpeza da Task 9.

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro (este arquivo ainda não é importado por nenhuma
página, então o build só valida sintaxe/imports).

- [ ] **Step 4: Commit**

```bash
git add web/lib/data/diretorio.js
git commit -m "Data layer do diretório público (listar/buscar perfis, especialidades, contagem de contatos)"
```

---

### Task 4: Server Actions do diretório (salvar perfil, upload de foto)

**Files:**
- Create: `web/lib/actions/diretorio.js`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`; `normalizarSlug`
  de `@/lib/slugify`.
- Produces: `salvarPerfil(prevState, formData)` — Server Action usada pela
  Task 5 (`PerfilDiretorioForm`).

- [ ] **Step 1: Escrever `web/lib/actions/diretorio.js`**

```js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarSlug } from "@/lib/slugify";

async function gerarSlugUnico(supabase, base) {
  const raiz = normalizarSlug(base) || "profissional";
  let slug = raiz;
  let sufixo = 1;

  while (true) {
    const { data } = await supabase
      .from("PerfilPublico")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;
    sufixo += 1;
    slug = `${raiz}-${sufixo}`;
  }
}

export async function salvarPerfil(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autorizado." };
  }

  const { data: usuario, error: erroUsuario } = await supabase
    .from("Usuarios")
    .select("id, nome")
    .eq("id_user", user.id)
    .single();

  if (erroUsuario) {
    return { error: "Não foi possível carregar seu cadastro." };
  }

  const bio = formData.get("bio");
  const cidade = formData.get("cidade");
  const estado = formData.get("estado");
  const modalidade = formData.get("modalidade");
  const valorSessaoRaw = formData.get("valor_sessao");
  const visivel = formData.get("visivel_diretorio") === "on";
  const especialidadeIds = formData.getAll("especialidades");
  const foto = formData.get("foto");

  const { data: perfilExistente } = await supabase
    .from("PerfilPublico")
    .select("id, slug, foto_url")
    .eq("usuario_id", usuario.id)
    .maybeSingle();

  let fotoUrl = perfilExistente?.foto_url ?? null;

  if (foto && foto.size > 0) {
    const extensao = foto.name.split(".").pop();
    const caminho = `${user.id}/foto.${extensao}`;
    const { error: erroUpload } = await supabase.storage
      .from("perfis-publicos")
      .upload(caminho, foto, { upsert: true });

    if (erroUpload) {
      return { error: "Não foi possível enviar a foto." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("perfis-publicos").getPublicUrl(caminho);
    fotoUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const dadosPerfil = {
    usuario_id: usuario.id,
    bio: bio || null,
    cidade: cidade || null,
    estado: estado || null,
    modalidade: modalidade || "ambos",
    valor_sessao: valorSessaoRaw ? Number(valorSessaoRaw) : null,
    foto_url: fotoUrl,
    visivel_diretorio: visivel,
    atualizado_em: new Date().toISOString(),
  };

  let perfilId = perfilExistente?.id;

  if (perfilExistente) {
    const { error } = await supabase
      .from("PerfilPublico")
      .update(dadosPerfil)
      .eq("id", perfilExistente.id);

    if (error) {
      return { error: "Não foi possível salvar o perfil." };
    }
  } else {
    const slug = await gerarSlugUnico(supabase, usuario.nome);
    const { data: novoPerfil, error } = await supabase
      .from("PerfilPublico")
      .insert({ ...dadosPerfil, slug })
      .select("id")
      .single();

    if (error) {
      return { error: "Não foi possível criar o perfil." };
    }
    perfilId = novoPerfil.id;
  }

  const { error: erroLimpaEspecialidades } = await supabase
    .from("PerfilEspecialidade")
    .delete()
    .eq("perfil_id", perfilId);

  if (erroLimpaEspecialidades) {
    return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
  }

  if (especialidadeIds.length > 0) {
    const linhas = especialidadeIds.map((especialidadeId) => ({
      perfil_id: perfilId,
      especialidade_id: especialidadeId,
    }));
    const { error: erroEspecialidades } = await supabase
      .from("PerfilEspecialidade")
      .insert(linhas);

    if (erroEspecialidades) {
      return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
    }
  }

  revalidatePath("/diretorio");
  return { mensagem: "Perfil salvo." };
}
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/actions/diretorio.js
git commit -m "Server Action salvarPerfil: cria/atualiza PerfilPublico, upload de foto, especialidades"
```

---

### Task 5: Página privada `/diretorio` (formulário + indicador)

**Files:**
- Create: `web/components/PerfilDiretorioForm.js`
- Create: `web/app/(app)/diretorio/page.js`
- Modify: `web/app/(app)/layout.js`

**Interfaces:**
- Consumes: `buscarMeuPerfil`, `listarEspecialidades`, `contarMeusContatos`
  de `@/lib/data/diretorio`; `salvarPerfil` de `@/lib/actions/diretorio`.

- [ ] **Step 1: Criar `web/components/PerfilDiretorioForm.js`**

```js
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function PerfilDiretorioForm({ action, perfil, especialidades }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-2xl space-y-4 card p-6">
      <div>
        <label htmlFor="bio" className="block text-sm font-semibold text-navy">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={perfil?.bio}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="foto" className="block text-sm font-semibold text-navy">
          Foto de perfil
        </label>
        {perfil?.foto_url && (
          <img
            src={perfil.foto_url}
            alt="Foto atual"
            className="h-16 w-16 rounded-full object-cover mt-1 mb-2"
          />
        )}
        <input id="foto" name="foto" type="file" accept="image/*" className="field" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="cidade" className="block text-sm font-semibold text-navy">
            Cidade
          </label>
          <input
            id="cidade"
            name="cidade"
            type="text"
            defaultValue={perfil?.cidade}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="estado" className="block text-sm font-semibold text-navy">
            Estado
          </label>
          <input
            id="estado"
            name="estado"
            type="text"
            maxLength={2}
            placeholder="SP"
            defaultValue={perfil?.estado}
            className="field"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="modalidade" className="block text-sm font-semibold text-navy">
            Modalidade
          </label>
          <select
            id="modalidade"
            name="modalidade"
            defaultValue={perfil?.modalidade ?? "ambos"}
            className="field"
          >
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div>
          <label htmlFor="valor_sessao" className="block text-sm font-semibold text-navy">
            Valor da sessão (opcional)
          </label>
          <input
            id="valor_sessao"
            name="valor_sessao"
            type="number"
            step="0.01"
            placeholder="A combinar"
            defaultValue={perfil?.valor_sessao ?? ""}
            className="field"
          />
        </div>
      </div>

      <div>
        <p className="block text-sm font-semibold text-navy mb-2">Especialidades</p>
        <div className="grid grid-cols-2 gap-2">
          {especialidades.map((esp) => (
            <label key={esp.id} className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                name="especialidades"
                value={esp.id}
                defaultChecked={perfil?.especialidade_ids?.includes(esp.id)}
              />
              {esp.nome}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="visivel_diretorio"
          name="visivel_diretorio"
          type="checkbox"
          defaultChecked={perfil?.visivel_diretorio}
          className="h-4 w-4"
        />
        <label htmlFor="visivel_diretorio" className="text-sm font-semibold text-navy">
          Aparecer no diretório público
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.mensagem && <p className="text-sm text-green-700">{state.mensagem}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar perfil"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Criar `web/app/(app)/diretorio/page.js`**

```js
import PerfilDiretorioForm from "@/components/PerfilDiretorioForm";
import { salvarPerfil } from "@/lib/actions/diretorio";
import { buscarMeuPerfil, listarEspecialidades, contarMeusContatos } from "@/lib/data/diretorio";

export default async function PaginaDiretorio() {
  const [perfil, especialidades, totalContatos] = await Promise.all([
    buscarMeuPerfil(),
    listarEspecialidades(),
    contarMeusContatos(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Meu Perfil no Diretório</h1>
        <p className="text-sm text-muted">{totalContatos} contato(s) recebido(s)</p>
      </div>
      <PerfilDiretorioForm action={salvarPerfil} perfil={perfil} especialidades={especialidades} />
    </div>
  );
}
```

- [ ] **Step 3: Adicionar link "Diretório" no nav — `web/app/(app)/layout.js`**

Localizar o bloco de links existente (entre `Consultórios` e
`WhatsApp`/`Administração`) e adicionar `<Link href="/diretorio">` visível
pra qualquer usuário logado (diferente do link "Administração", que só
aparece pra admin):

```js
            <Link href="/consultorios">Consultórios</Link>
            <Link href="/diretorio">Diretório</Link>
            <Link href="/configuracoes/whatsapp">WhatsApp</Link>
```

(a linha `{usuario.role === "admin" && (<Link href="/admin/profissionais">Administração</Link>)}`
que já existe logo abaixo permanece sem mudança)

- [ ] **Step 4: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -30
```

Expected: build sem erro, rota `/diretorio` aparece na lista de rotas.

- [ ] **Step 5: Commit**

```bash
git add web/components/PerfilDiretorioForm.js web/app/\(app\)/diretorio/page.js "web/app/(app)/layout.js"
git commit -m "Página /diretorio: psicólogo edita perfil público e vê contagem de contatos"
```

---

### Task 6: Roteamento do subdomínio `busca.` + shell público

**Files:**
- Modify: `web/proxy.js`
- Create: `web/app/busca/layout.js`

**Interfaces:**
- Consumes: mesmo padrão de `blog.`/`comece.` já existente em
  `web/proxy.js`.

- [ ] **Step 1: Adicionar o bloco `busca.` em `web/proxy.js`**

Adicionar logo antes do bloco `if (host.startsWith("blog."))` (mesma
estrutura do bloco `comece.` que já existe acima dele):

```js
  // busca.psifacil.com.br: diretório público de psicólogos, reescreve
  // tudo pra /busca — mesmo raciocínio do blog/landing, nunca passa pelo
  // updateSession.
  if (host.startsWith("busca.")) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/busca")) {
      url.pathname = `/busca${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }
```

- [ ] **Step 2: Criar `web/app/busca/layout.js`**

```js
export const metadata = {
  title: {
    default: "Encontre um psicólogo | PsiFácil",
    template: "%s | Encontre um psicólogo",
  },
  description: "Encontre psicólogos por especialidade, cidade e modalidade de atendimento.",
};

export default function LayoutBusca({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <a href="/">
            <img src="/logo.svg" alt="PsiFácil" className="h-8 w-auto" />
          </a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
```

**Nota:** o link do logo usa `<a href="/">` (não `next/link`) de propósito
— nesse subdomínio, `/` já é reescrito internamente pro `/busca` (a
listagem), então um link relativo simples é suficiente e evita confusão
com o `Link` do domínio principal.

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro (ainda não existe `/busca/page.js`, então o
`layout.js` sozinho não gera rota própria — isso é esperado, a Task 7
adiciona a página).

- [ ] **Step 4: Commit**

```bash
git add web/proxy.js "web/app/busca/layout.js"
git commit -m "Roteamento do subdomínio busca.psifacil.com.br"
```

---

### Task 7: Página de busca/listagem `/busca`

**Files:**
- Create: `web/app/busca/page.js`

**Interfaces:**
- Consumes: `buscarPerfisPublicos`, `listarEspecialidades` de
  `@/lib/data/diretorio`.

- [ ] **Step 1: Criar `web/app/busca/page.js`**

```js
import Link from "next/link";
import { buscarPerfisPublicos, listarEspecialidades } from "@/lib/data/diretorio";

export default async function PaginaBusca({ searchParams }) {
  const params = await searchParams;

  const filtros = {
    cidade: params.cidade || undefined,
    modalidade: params.modalidade || undefined,
    especialidade: params.especialidade || undefined,
    valorMax: params.valorMax || undefined,
  };

  const [perfis, especialidades] = await Promise.all([
    buscarPerfisPublicos(filtros),
    listarEspecialidades(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Encontre um psicólogo</h1>

      <form className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="cidade" className="block text-xs font-semibold text-navy">
            Cidade
          </label>
          <input
            id="cidade"
            name="cidade"
            type="text"
            defaultValue={filtros.cidade}
            className="field mt-0"
          />
        </div>
        <div>
          <label htmlFor="modalidade" className="block text-xs font-semibold text-navy">
            Modalidade
          </label>
          <select
            id="modalidade"
            name="modalidade"
            defaultValue={filtros.modalidade || ""}
            className="field mt-0"
          >
            <option value="">Qualquer</option>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </div>
        <div>
          <label htmlFor="especialidade" className="block text-xs font-semibold text-navy">
            Especialidade
          </label>
          <select
            id="especialidade"
            name="especialidade"
            defaultValue={filtros.especialidade || ""}
            className="field mt-0"
          >
            <option value="">Qualquer</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
      </form>

      {perfis.length === 0 ? (
        <p className="empty-state">Nenhum psicólogo encontrado com esses filtros.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perfis.map((p) => (
            <Link key={p.id} href={`/${p.slug}`} className="card p-5 block">
              <div className="flex items-center gap-3">
                {p.foto_url && (
                  <img
                    src={p.foto_url}
                    alt={p.nome}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-navy">{p.nome}</p>
                  <p className="text-sm text-muted">
                    {p.cidade ? `${p.cidade}/${p.estado}` : "Atendimento online"} ·{" "}
                    {p.modalidade}
                  </p>
                </div>
              </div>
              {p.especialidades.length > 0 && (
                <p className="text-sm text-muted mt-3">{p.especialidades.join(", ")}</p>
              )}
              <p className="text-sm font-semibold text-navy mt-2">
                {p.valor_sessao ? `A partir de R$ ${p.valor_sessao}` : "Valor a combinar"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Nota sobre o link do card:** `href={`/${p.slug}`}` é relativo ao host
atual — como esta página só é servida via `busca.psifacil.com.br` (por
causa do rewrite da Task 6), o link resolve pra
`busca.psifacil.com.br/<slug>`, que a Task 8 implementa como
`web/app/busca/[slug]/page.js` (internamente `/busca/<slug>`, igual ao
padrão já usado no blog).

- [ ] **Step 2: Testar localmente com o perfil de teste da Task 3**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Em outro terminal, depois do servidor subir:

```bash
curl -s -H "Host: busca.localhost:3000" http://localhost:3000/ --max-time 15 | grep -o "Bio de teste\|São Paulo"
```

Expected: nenhum resultado de texto de bio no card (a listagem só mostra
nome/cidade/modalidade/valor, não a bio) — confirmar em vez disso que
"São Paulo" aparece (cidade do perfil de teste criado na Task 3). Se não
aparecer, revisar o filtro/join de `buscarPerfisPublicos`.

- [ ] **Step 3: Encerrar o servidor de dev**

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 4: Commit**

```bash
git add "web/app/busca/page.js"
git commit -m "Página de busca/listagem do diretório público"
```

---

### Task 8: Página de perfil individual `/busca/[slug]`

**Files:**
- Create: `web/app/busca/[slug]/page.js`

**Interfaces:**
- Consumes: `buscarPerfilPorSlug` de `@/lib/data/diretorio`.

- [ ] **Step 1: Criar `web/app/busca/[slug]/page.js`**

```js
import { notFound } from "next/navigation";
import { buscarPerfilPorSlug } from "@/lib/data/diretorio";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);
  if (!perfil) return {};

  return {
    title: perfil.nome,
    description: perfil.bio ?? undefined,
  };
}

export default async function PaginaPerfilPublico({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);

  if (!perfil) {
    notFound();
  }

  return (
    <article className="space-y-4">
      <div className="flex items-center gap-4">
        {perfil.foto_url && (
          <img
            src={perfil.foto_url}
            alt={perfil.nome}
            className="h-20 w-20 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="page-title">{perfil.nome}</h1>
          <p className="text-sm text-muted">
            {perfil.crp && `CRP ${perfil.crp} · `}
            {perfil.cidade ? `${perfil.cidade}/${perfil.estado}` : "Atendimento online"} ·{" "}
            {perfil.modalidade}
          </p>
        </div>
      </div>

      {perfil.bio && <p className="text-navy">{perfil.bio}</p>}

      {perfil.especialidades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perfil.especialidades.map((e) => (
            <span key={e.id} className="text-xs font-semibold text-navy bg-background rounded-full px-3 py-1">
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <p className="font-semibold text-navy">
        {perfil.valor_sessao ? `A partir de R$ ${perfil.valor_sessao}` : "Valor a combinar"}
      </p>

      <a href={`/ir/${perfil.id}`} className="btn-primary inline-flex">
        Falar no WhatsApp
      </a>
    </article>
  );
}
```

- [ ] **Step 2: Testar localmente**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

```bash
curl -s -H "Host: busca.localhost:3000" http://localhost:3000/teste-plano-diretorio --max-time 15 | grep -o "Bio de teste"
```

Expected: `Bio de teste` aparece (confirma que a página de perfil
individual carrega o perfil de teste corretamente).

- [ ] **Step 3: Encerrar o servidor de dev**

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 4: Commit**

```bash
git add "web/app/busca/[slug]/page.js"
git commit -m "Página de perfil público individual do diretório"
```

---

### Task 9: Rota de contato — registra o clique e redireciona pro WhatsApp

**Files:**
- Create: `web/app/busca/ir/[id]/route.js`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`.

- [ ] **Step 1: Criar `web/app/busca/ir/[id]/route.js`**

```js
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: perfil, error } = await supabase
    .from("PerfilPublico")
    .select("usuario_id, Usuarios!inner(contato, nome)")
    .eq("id", id)
    .eq("visivel_diretorio", true)
    .maybeSingle();

  if (error || !perfil) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await supabase
    .from("ContatoDiretorio")
    .insert({ usuario_id: perfil.usuario_id, origem: "perfil" });

  const numero = String(perfil.Usuarios.contato).replace(/\D/g, "");
  const mensagem = encodeURIComponent(
    `Olá ${perfil.Usuarios.nome}, vi seu perfil no PsiFácil e gostaria de conversar.`
  );

  return NextResponse.redirect(`https://wa.me/55${numero}?text=${mensagem}`);
}
```

**Nota:** o prefixo `55` assume número brasileiro sem DDI já incluso no
campo `contato` (mesmo formato usado hoje em `Usuarios.contato`, só
dígitos de DDD+número). Se algum número já vier com DDI incluso, ajustar
aqui — validar isso no Step 2 abaixo com o perfil de teste real.

- [ ] **Step 2: Testar localmente (registrar clique + confirmar redirect)**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Pegar o `id` do perfil de teste (não o slug):

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select id from "PerfilPublico" where slug = $1`, ["teste-plano-diretorio"]);
  console.log(rows[0].id);
  await client.end();
})();
'
```

Com o id em mãos:

```bash
curl -s -i -H "Host: busca.localhost:3000" "http://localhost:3000/ir/<ID_AQUI>" --max-time 15 | grep -i "^location"
```

Expected: `location: https://wa.me/55<numero>?text=...`. Depois confirmar
que o clique foi gravado:

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select count(*) from "ContatoDiretorio"`);
  console.log("contatos registrados:", rows[0].count);
  await client.end();
})();
'
```

Expected: `contatos registrados: 1` (ou mais, se rodou o teste mais de uma vez).

- [ ] **Step 3: Limpar os dados de teste criados nas Tasks 3/7/8/9**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows: perfil } = await client.query(`select id, usuario_id from "PerfilPublico" where slug = $1`, ["teste-plano-diretorio"]);
  if (perfil.length) {
    await client.query(`delete from "ContatoDiretorio" where usuario_id = $1`, [perfil[0].usuario_id]);
    await client.query(`delete from "PerfilPublico" where id = $1`, [perfil[0].id]);
    console.log("dados de teste removidos");
  }
  await client.end();
})();
'
```

- [ ] **Step 4: Encerrar o servidor de dev**

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 5: Commit**

```bash
git add "web/app/busca/ir/[id]/route.js"
git commit -m "Rota de contato: registra clique em ContatoDiretorio e redireciona pro WhatsApp"
```

---

### Task 10: Sitemap, robots, Dockerfile e variável de ambiente

**Files:**
- Modify: `web/app/sitemap.js`
- Modify: `web/Dockerfile`
- Modify: `web/.env.local`

**Interfaces:**
- Consumes: `buscarPerfisPublicos` de `@/lib/data/diretorio`;
  `listarArtigosPublicados` de `@/lib/data/artigos` (já usado hoje).

- [ ] **Step 1: Ler o `web/app/sitemap.js` atual pra confirmar o formato exato antes de editar**

```bash
cat "c:/Users/Administrador/Desktop/Projetos/Psicologia/web/app/sitemap.js"
```

(Hoje ele só lista artigos do blog usando `NEXT_PUBLIC_BLOG_URL` — confirmar
a forma exata do array retornado antes do próximo passo, pra manter o
mesmo formato.)

- [ ] **Step 2: Atualizar `web/app/sitemap.js` pra incluir os perfis do diretório**

```js
import { listarArtigosPublicados } from "@/lib/data/artigos";
import { buscarPerfisPublicos } from "@/lib/data/diretorio";

export const revalidate = 3600;

export default async function sitemap() {
  const origemBlog = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const origemBusca = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  const [artigos, perfis] = await Promise.all([
    listarArtigosPublicados(),
    buscarPerfisPublicos({}),
  ]);

  return [
    {
      url: origemBlog,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...artigos.map((a) => ({
      url: `${origemBlog}/${a.slug}`,
      lastModified: a.publicado_em,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
    {
      url: origemBusca,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...perfis.map((p) => ({
      url: `${origemBusca}/${p.slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
    })),
  ];
}
```

**Nota:** manter o corpo exato do bloco de artigos que já existe hoje (não
reescrever do zero) — só adicionar o bloco de perfis ao array retornado.
Se o arquivo lido no Step 1 tiver `changeFrequency`/`priority` diferentes
dos mostrados acima pros artigos, preservar os valores originais.

- [ ] **Step 3: Adicionar `NEXT_PUBLIC_BUSCA_URL` no `web/Dockerfile`**

Localizar o bloco de `ARG`/`ENV` já existente (que tem
`NEXT_PUBLIC_BLOG_URL`) e adicionar mais uma variável no mesmo padrão:

```dockerfile
ARG NEXT_PUBLIC_BUSCA_URL
ENV NEXT_PUBLIC_BUSCA_URL=$NEXT_PUBLIC_BUSCA_URL
```

(inserir logo depois das linhas de `NEXT_PUBLIC_BLOG_URL`, seguindo a
mesma ordem `ARG`s primeiro / `ENV`s depois já usada no arquivo)

- [ ] **Step 4: Adicionar a variável no `web/.env.local`**

```bash
echo "NEXT_PUBLIC_BUSCA_URL=https://busca.psifacil.com.br" >> "c:/Users/Administrador/Desktop/Projetos/Psicologia/web/.env.local"
```

- [ ] **Step 5: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro, `/sitemap.xml` continua listado nas rotas.

- [ ] **Step 6: Commit**

```bash
git add "web/app/sitemap.js" web/Dockerfile web/.env.local
git commit -m "Inclui perfis do diretório no sitemap + NEXT_PUBLIC_BUSCA_URL"
```

---

### Task 11: Verificação end-to-end local e deploy

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Build completo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -60
```

Expected: build sem erro, rotas `/diretorio`, `/busca`, `/busca/[slug]`,
`/busca/ir/[id]` todas listadas.

- [ ] **Step 2: Subir o servidor de dev e recriar um perfil de teste completo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Repetir o insert de perfil de teste da Task 3 (Step 2), depois:

1. `curl -H "Host: busca.localhost:3000" http://localhost:3000/` → confirmar
   que o card do perfil de teste aparece.
2. `curl -H "Host: busca.localhost:3000" http://localhost:3000/teste-plano-diretorio`
   → confirmar bio/especialidades.
3. `curl -i -H "Host: busca.localhost:3000" http://localhost:3000/ir/<id>` →
   confirmar redirect pro `wa.me`.
4. `curl http://localhost:3000/sitemap.xml` → confirmar que a URL do
   perfil de teste aparece com o host `busca.psifacil.com.br`.

**Checagem de RLS negativa (importante, a conexão via `pg` usada nas outras
tasks conecta como superusuário e não serve pra isso — ela ignora RLS):**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node -e '
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(Boolean).map(l => { const i=l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
(async () => {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await anon.from("ContatoDiretorio").select("*");
  console.log("linhas retornadas pro anon:", data ? data.length : "erro: " + error.message);
})();
'
```

Expected: `linhas retornadas pro anon: 0` — confirma que a policy
`contatodiretorio_select_dono` está bloqueando leitura pública mesmo que
existam linhas na tabela (inseridas no Step 2, item 3 acima).

- [ ] **Step 3: Testar o formulário `/diretorio` no navegador (chrome-devtools MCP)**

Login como o usuário admin já existente (mesma conta usada em testes
anteriores desta sessão), navegar até `http://localhost:3000/diretorio`,
preencher bio/cidade/estado/modalidade/especialidades, marcar "Aparecer no
diretório público", salvar, confirmar mensagem de sucesso e que o perfil
agora aparece em `busca.localhost:3000`.

- [ ] **Step 4: Limpar todos os dados de teste**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`delete from "ContatoDiretorio"`);
  await client.query(`delete from "PerfilPublico" where slug like $1`, ["teste-%"]);
  console.log("limpo");
  await client.end();
})();
'
```

**Cuidado:** revisar esse delete antes de rodar caso já existam perfis
reais de teste do usuário (não do plano) na tabela — ajustar o filtro pra
não apagar dado real.

- [ ] **Step 5: Encerrar o servidor de dev**

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 6: Pedir confirmação do usuário antes de `git push`**

Este projeto já teve incidentes de produção (porta errada, variável de
ambiente com nome errado, certificado SSL) resolvidos ao longo desta
sessão — sempre confirmar com o usuário antes de `git push` (dispara
possibilidade de deploy) e sempre pedir pra ele clicar em "Deploy" no
EasyPanel manualmente (confirmado nesta sessão: o EasyPanel não reimplanta
sozinho a partir de um push).

- [ ] **Step 7: Depois do push + deploy, passos de infraestrutura (do usuário)**

1. DNS (Registro.br): registro A `busca.psifacil.com.br` →
   `179.198.103.130` (mesmo padrão de `blog`/`comece`).
2. EasyPanel: adicionar `busca.psifacil.com.br` como domínio do mesmo
   serviço (aba Domains).
3. EasyPanel: adicionar o build-arg
   `NEXT_PUBLIC_BUSCA_URL=https://busca.psifacil.com.br` (mesmo lugar onde
   `NEXT_PUBLIC_BLOG_URL`/`NEXT_PUBLIC_SITE_URL` já estão) — dispara
   rebuild.
4. Se o certificado SSL do novo subdomínio ficar preso no autoassinado do
   EasyPanel (já aconteceu com `blog.` e `comece.` nesta sessão): remover e
   adicionar de novo o domínio na aba Domains costuma resolver.

- [ ] **Step 8: Verificação final em produção**

Depois do deploy: `curl` nos três domínios + `busca.psifacil.com.br`,
depois conferência visual via chrome-devtools MCP (mesmo ritual já usado
pro blog e pra landing nesta sessão).
