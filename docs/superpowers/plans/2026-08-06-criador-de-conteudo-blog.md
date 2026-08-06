# Papel "Criador de Conteúdo" no Blog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin marcar profissionais específicos como aptos a
publicar artigo no blog, sem dar acesso administrativo completo a eles.

**Architecture:** Uma coluna booleana nova em `Usuarios` + uma policy de
RLS relaxada em `artigos` + o gate compartilhado do `/admin` relaxado (com
as duas páginas que devem continuar admin-only ganhando checagem própria).

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions),
Supabase (Postgres + RLS) — nenhuma dependência nova.

## Global Constraints

- Projeto sem suíte de testes automatizados — verificação é `npm run
  build`, consulta SQL direta via `node -e` com `pg`, e teste manual
  local com `curl`/navegador (chrome-devtools MCP).
- Migration aplicada via o mesmo script inline `node -e` com `pg` já
  usado nas migrations anteriores — não existe Supabase CLI funcional
  neste ambiente.
- Seguir o padrão já estabelecido: Server Actions com `"use server"`;
  data layer em `web/lib/data/*.js` sempre com `createClient()` de
  `@/lib/supabase/server`; classes CSS existentes (`.card`, `.btn-primary`,
  `.btn-outline`, `.page-title`, `text-navy`, `text-muted`) — não criar
  classe nova.
- `aprovarProfissional` (já existente, `web/lib/actions/profissionais.js`)
  não faz checagem de role própria — confia inteiramente no RLS pra
  bloquear não-admin. A ação nova (`alternarCriadorConteudo`) segue o
  mesmo padrão, por consistência com o resto do arquivo.
- Commits em português, um por task.

---

### Task 1: Migration — coluna `criador_conteudo` + RLS de `artigos`

**Files:**
- Create: `supabase/migrations/20260806000001_add_criador_conteudo.sql`

**Interfaces:**
- Produces: coluna `public."Usuarios".criador_conteudo` (boolean, not
  null, default false); policy `artigos_admin_write` atualizada. Tasks 2,
  3, 4, 5 dependem disso.

- [ ] **Step 1: Escrever a migration**

```sql
-- Papel "criador de conteúdo": permite publicar artigo no blog sem ser
-- admin da plataforma. Evolução pedida do item 1 do backlog.
alter table public."Usuarios"
  add column criador_conteudo boolean not null default false;

drop policy "artigos_admin_write" on public.artigos;

create policy "artigos_admin_write" on public.artigos
  for all using (
    public.is_admin()
    or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );
```

- [ ] **Step 2: Aplicar a migration no banco real**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const fs = require("fs");
const { Client } = require("pg");
(async () => {
  const sql = fs.readFileSync("supabase/migrations/20260806000001_add_criador_conteudo.sql", "utf8");
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

- [ ] **Step 3: Verificar coluna e policy**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows: cols } = await client.query(`select column_name, data_type, column_default from information_schema.columns where table_name = $1 and column_name = $2`, ["Usuarios", "criador_conteudo"]);
  console.log("coluna:", JSON.stringify(cols));
  const { rows: pol } = await client.query(`select policyname, qual from pg_policies where tablename = $1 and policyname = $2`, ["artigos", "artigos_admin_write"]);
  console.log("policy:", JSON.stringify(pol));
  await client.end();
})();
'
```

Expected: coluna `boolean`, `column_default` contendo `false`; policy
`artigos_admin_write` com `qual` mencionando `criador_conteudo`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806000001_add_criador_conteudo.sql
git commit -m "Migration: coluna criador_conteudo + RLS de artigos aceita criador de conteúdo"
```

---

### Task 2: Data layer — expor `criador_conteudo`

**Files:**
- Modify: `web/lib/data/usuario.js`
- Modify: `web/lib/data/profissionais.js`

**Interfaces:**
- Consumes: coluna `criador_conteudo` (Task 1).
- Produces: `buscarUsuarioAtual()` e `listarProfissionais()` agora
  retornam também `criador_conteudo` (boolean). Tasks 4 e 5 dependem
  disso.

- [ ] **Step 1: Atualizar `buscarUsuarioAtual` em `web/lib/data/usuario.js`**

Trocar:

```js
    .select("id, nome, whatsapp_number, whatsapp_verified, role, aprovado")
```

por:

```js
    .select("id, nome, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo")
```

- [ ] **Step 2: Atualizar `listarProfissionais` em `web/lib/data/profissionais.js`**

Trocar:

```js
    .select("id, nome, email, contato, role, crp, aprovado, created_at")
```

por:

```js
    .select("id, nome, email, contato, role, crp, aprovado, criador_conteudo, created_at")
```

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/lib/data/usuario.js web/lib/data/profissionais.js
git commit -m "Data layer: buscarUsuarioAtual e listarProfissionais expõem criador_conteudo"
```

---

### Task 3: Server Action `alternarCriadorConteudo`

**Files:**
- Modify: `web/lib/actions/profissionais.js`

**Interfaces:**
- Consumes: nenhuma interface nova de outras tasks.
- Produces: `alternarCriadorConteudo(id, valorAtual)` — Server Action
  usada pela Task 5 (botão na listagem).

- [ ] **Step 1: Adicionar a função no fim de `web/lib/actions/profissionais.js`**

```js

export async function alternarCriadorConteudo(id, valorAtual) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Usuarios")
    .update({ criador_conteudo: !valorAtual })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}
```

(mesmo padrão de `aprovarProfissional`, logo acima no mesmo arquivo — sem
checagem de role própria, RLS da Task 1 já bloqueia não-admin de alterar
`Usuarios` de outra pessoa)

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/actions/profissionais.js
git commit -m "Server Action alternarCriadorConteudo"
```

---

### Task 4: Gates — relaxa `/admin`, tranca `/admin/profissionais`

**Files:**
- Modify: `web/app/(app)/admin/layout.js`
- Modify: `web/app/(app)/admin/profissionais/page.js`
- Modify: `web/app/(app)/admin/profissionais/novo/page.js`

**Interfaces:**
- Consumes: `usuario.criador_conteudo`, `usuario.role` (Task 2).

**Nota importante:** as três mudanças abaixo têm que ir no mesmo commit —
relaxar o layout sem travar `/admin/profissionais` na mesma vez abriria
uma janela onde um criador de conteúdo acessaria a tela de profissionais
digitando a URL direto.

- [ ] **Step 1: Relaxar o gate e o nav em `web/app/(app)/admin/layout.js`**

Substituir o arquivo inteiro por:

```js
import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutAdmin({ children }) {
  const usuario = await buscarUsuarioAtual();

  if (usuario.role !== "admin" && !usuario.criador_conteudo) {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-4 text-sm font-semibold text-navy">
        {usuario.role === "admin" && <Link href="/admin/profissionais">Profissionais</Link>}
        <Link href="/admin/artigos">Blog</Link>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Adicionar guarda própria em `web/app/(app)/admin/profissionais/page.js`**

Trocar:

```js
import Link from "next/link";
import { listarProfissionais } from "@/lib/data/profissionais";
import { aprovarProfissional } from "@/lib/actions/profissionais";

export default async function PaginaProfissionais() {
  const profissionais = await listarProfissionais();
```

por:

```js
import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { listarProfissionais } from "@/lib/data/profissionais";
import { aprovarProfissional } from "@/lib/actions/profissionais";

export default async function PaginaProfissionais() {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const profissionais = await listarProfissionais();
```

- [ ] **Step 3: Adicionar guarda própria em `web/app/(app)/admin/profissionais/novo/page.js`**

Substituir o arquivo inteiro por:

```js
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import ConvidarProfissionalForm from "@/components/ConvidarProfissionalForm";
import { convidarProfissional } from "@/lib/actions/profissionais";

export default async function PaginaConvidarProfissional() {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Convidar Profissional</h1>
      <ConvidarProfissionalForm action={convidarProfissional} />
    </div>
  );
}
```

- [ ] **Step 4: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add "web/app/(app)/admin/layout.js" "web/app/(app)/admin/profissionais/page.js" "web/app/(app)/admin/profissionais/novo/page.js"
git commit -m "Gate: /admin aceita criador de conteúdo; /admin/profissionais continua só admin"
```

---

### Task 5: UI — botão de alternar criador de conteúdo

**Files:**
- Modify: `web/app/(app)/admin/profissionais/page.js`

**Interfaces:**
- Consumes: `alternarCriadorConteudo` (Task 3); `p.criador_conteudo`
  (Task 2, já incluído no retorno de `listarProfissionais`).

- [ ] **Step 1: Importar a ação e adicionar o botão por linha**

Trocar o import de ações:

```js
import { aprovarProfissional } from "@/lib/actions/profissionais";
```

por:

```js
import { aprovarProfissional, alternarCriadorConteudo } from "@/lib/actions/profissionais";
```

Trocar o bloco de cada linha da listagem:

```js
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {p.role === "admin" ? "Admin" : "Psicólogo"}
                </span>
                {p.aprovado ? (
                  <span className="text-sm text-green-700">Aprovado</span>
                ) : (
                  <form action={aprovarProfissional.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      Aprovar (pendente)
                    </button>
                  </form>
                )}
              </div>
```

por:

```js
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {p.role === "admin" ? "Admin" : "Psicólogo"}
                </span>
                {p.aprovado ? (
                  <span className="text-sm text-green-700">Aprovado</span>
                ) : (
                  <form action={aprovarProfissional.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      Aprovar (pendente)
                    </button>
                  </form>
                )}
                {p.role !== "admin" && (
                  <form action={alternarCriadorConteudo.bind(null, p.id, p.criador_conteudo)}>
                    <button type="submit" className="btn-outline text-sm">
                      {p.criador_conteudo ? "Remover criador de conteúdo" : "Tornar criador de conteúdo"}
                    </button>
                  </form>
                )}
              </div>
```

(`p.role !== "admin"` porque admin já publica em `/admin/artigos` de
qualquer jeito — o toggle só faz sentido pra quem não é admin)

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(app)/admin/profissionais/page.js"
git commit -m "UI: botão de alternar criador de conteúdo em /admin/profissionais"
```

---

### Task 6: Verificação end-to-end

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Criar um profissional de teste descartável e marcar como criador de conteúdo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node -e '
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(Boolean).map(l => { const i=l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const email = "teste.criador.conteudo." + Date.now() + "@example.com";
  const senha = "senhaTeste123456";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (createErr) { console.error(createErr.message); process.exit(1); }
  const { error: erroUsuarios } = await admin.from("Usuarios").insert({
    id_user: created.user.id, nome: "Teste Criador Conteudo", email,
    contato: 11999998888, role: "psicologo", aprovado: true, criador_conteudo: true,
  });
  if (erroUsuarios) { console.error(erroUsuarios.message); process.exit(1); }
  console.log("EMAIL=" + email);
  console.log("SENHA=" + senha);
  console.log("USER_ID=" + created.user.id);
})();
'
```

- [ ] **Step 2: Testar no navegador (chrome-devtools MCP)**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Login com o e-mail/senha de teste do Step 1:
1. Acessar `/admin/artigos` → deve carregar normalmente (sem redirecionar).
2. Criar um artigo de teste em `/admin/artigos/novo`, com o título
   exatamente `Artigo de teste - criador de conteudo` (usado no Step 3
   pra encontrar e apagar essa linha depois), salvar → deve funcionar
   (RLS aceitando `criador_conteudo`).
3. Acessar `/admin/profissionais` diretamente pela URL → deve
   redirecionar pra `/admin/artigos` (não é admin).
4. Confirmar que o link "Profissionais" não aparece no nav do `/admin`.
5. Deslogar, logar como admin, ir em `/admin/profissionais` → confirmar
   que aparece o botão "Remover criador de conteúdo" na linha do
   profissional de teste (já que ele foi criado com `criador_conteudo:
   true`). Clicar, confirmar que vira "Tornar criador de conteúdo".
   Clicar de novo pra deixar como estava (`true`) antes de seguir pro
   cleanup.

- [ ] **Step 3: Limpar dados de teste**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node -e '
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(Boolean).map(l => { const i=l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await admin.from("artigos").delete().eq("titulo", "Artigo de teste - criador de conteudo");
  await admin.from("Usuarios").delete().eq("email", "SUBSTITUIR_PELO_EMAIL_DE_TESTE");
  await admin.auth.admin.deleteUser("SUBSTITUIR_PELO_USER_ID_DO_STEP_1");
  console.log("limpo");
})();
'
```

(substituir o e-mail e o `USER_ID` pelos valores reais impressos no Step
1 antes de rodar; `artigos.autor` é só um campo de texto livre, não uma
FK pra `Usuarios` — por isso o artigo de teste é limpo pelo título exato
usado no Step 2, não por relação com o usuário de teste)

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 4: Pedir confirmação do usuário antes de `git push`**

Mesma regra já estabelecida no projeto: confirmar antes de `git push` e
lembrar de clicar "Deploy" no EasyPanel depois.

## Self-Review

- **Cobertura da spec:** coluna+RLS (Task 1), gates (Task 4), UI (Task 5)
  e ação (Task 3) — todos os pontos do design têm task correspondente.
  Autoria/byline explicitamente fora de escopo, nenhuma task cobre isso.
- **Placeholders:** nenhum, exceto os dois marcadores de substituição no
  script de limpeza da Task 6 (email/USER_ID), que são inerentes a um
  script de limpeza pós-teste — o valor real só existe depois do Step 1
  rodar.
- **Consistência:** `criador_conteudo` é o mesmo nome em todas as tasks
  (coluna, select, ação, prop); `alternarCriadorConteudo(id, valorAtual)`
  é a mesma assinatura na Task 3 (definição) e Task 5 (uso via `.bind`).
