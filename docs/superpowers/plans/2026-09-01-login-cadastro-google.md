# Login e Cadastro via Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar login/autocadastro de profissional via Google como alternativa ao e-mail/senha já existente, fechando o gap de `Usuarios.contato` (NOT NULL) que o perfil do Google nunca preenche.

**Architecture:** Uma única Server Action (`entrarComGoogle`) dispara `signInWithOAuth` a partir de `/login` e `/cadastro`. O callback OAuth existente (`/auth/callback`) ganha uma checagem: se não existe `Usuarios` para o `auth.uid()` recém-autenticado, redireciona pra uma rota nova (`/completar-perfil`, fora do grupo `(app)` de propósito) que coleta o telefone obrigatório antes de criar a linha e liberar o resto do app.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Auth (OAuth provider Google), `@supabase/ssr`.

**Spec:** `docs/superpowers/specs/2026-09-01-login-cadastro-google-design.md`

## Global Constraints

- Sem framework de testes automatizado no projeto — verificação via `npm run build` + scripts Node descartáveis contra produção (apagar ao final de cada task), mesmo padrão já usado em itens anteriores.
- `Usuarios.contato` é `NOT NULL` — `completarPerfilGoogle` sempre precisa desse campo preenchido antes do insert.
- `/completar-perfil` fica **fora** do grupo de rotas `(app)` de propósito — não pode passar por `(app)/layout.js` (que chama `buscarUsuarioAtual()` e quebraria sem `Usuarios`).
- Provisionamento via Google usa `role: "psicologo"`, `aprovado: false` — mesma paridade do autocadastro por e-mail já existente (`cadastrar` em `web/lib/actions/auth.js`).
- RLS confirmada: policy `usuarios_self` já permite insert com `id_user = auth.uid()` via client de sessão comum (`createClient()`) — sem precisar de `createAdminClient()` em nenhum passo deste plano.
- Sem migration nesta entrega — reaproveita colunas já existentes de `Usuarios`.

---

## Task 1: Server Action `entrarComGoogle` + botão em `/login`

**Files:**
- Modify: `web/lib/actions/auth.js`
- Modify: `web/app/(auth)/login/page.js`

**Interfaces:**
- Produces: `entrarComGoogle(origem)` — Server Action, sem retorno útil no caminho de sucesso (sempre `redirect()`); em erro, `redirect("/login?erro=google")`.

- [ ] **Step 1: Adicionar `entrarComGoogle` em `web/lib/actions/auth.js`**

Adicionar ao final do arquivo (depois de `atualizarSenha`):

```js
export async function entrarComGoogle(origem) {
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = origem === "busca" ? "/diretorio" : "/";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data?.url) {
    redirect("/login?erro=google");
  }

  redirect(data.url);
}
```

- [ ] **Step 2: Adicionar o botão em `web/app/(auth)/login/page.js`**

Editar o arquivo pra incluir o import e o botão, logo antes dos links de "Esqueci minha senha"/"Cadastre-se":

```jsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { entrar, entrarComGoogle } from "@/lib/actions/auth";

const estadoInicial = {};

export default function PaginaLogin() {
  const [state, formAction, pending] = useActionState(entrar, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Acessar Conta</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-navy">
            E-mail
          </label>
          <input id="email" name="email" type="email" required className="field" />
        </div>

        <div>
          <label htmlFor="senha" className="block text-sm font-semibold text-navy">
            Senha
          </label>
          <input id="senha" name="senha" type="password" required className="field" />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Entrando..." : "Entrar"}
        </button>

        <div className="flex items-center gap-2 text-xs text-muted">
          <div className="h-px flex-1 bg-gray-200" />
          ou
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form action={entrarComGoogle.bind(null, null)}>
          <button type="submit" className="btn-outline w-full">
            Entrar com Google
          </button>
        </form>

        <Link href="/esqueci-senha" className="block text-sm link text-center">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="block text-sm link text-center">
          Não tem conta? Cadastre-se
        </Link>
      </form>
    </div>
  );
}
```

Nota: o `<form>` do Google fica **dentro** do `<form>` principal no JSX acima
só visualmente (são elementos irmãos na árvore renderizada — HTML não
permite `<form>` aninhado de verdade). Ao escrever o JSX, confirmar que o
`<form action={entrarComGoogle.bind(null, null)}>` fecha o `<form
action={formAction}>` ANTES de abrir, não fica aninhado. Reescrever como:

```jsx
      </form>

      <div className="w-full max-w-sm flex items-center gap-2 text-xs text-muted -mt-2">
        <div className="h-px flex-1 bg-gray-200" />
        ou
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form action={entrarComGoogle.bind(null, null)} className="w-full max-w-sm">
        <button type="submit" className="btn-outline w-full">
          Entrar com Google
        </button>
      </form>
    </div>
  );
}
```

(ajustar a estrutura final entre o fechamento do form principal e o `</div>` externo, sem aninhar forms.)

- [ ] **Step 3: Verificar que o build passa**

Rodar: `cd web && npm run build`
Esperado: sem erro de compilação, `/login` continua na lista de rotas.

- [ ] **Step 4: Commit**

```bash
git add web/lib/actions/auth.js "web/app/(auth)/login/page.js"
git commit -m "feat: adiciona login via Google em /login"
```

---

## Task 2: Botão "Cadastrar com Google" em `/cadastro`

**Files:**
- Modify: `web/components/CadastroForm.js`

**Interfaces:**
- Consumes: `entrarComGoogle(origem)` de `@/lib/actions/auth` (Task 1).

- [ ] **Step 1: Editar `web/components/CadastroForm.js`**

```jsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar, entrarComGoogle } from "@/lib/actions/auth";

const estadoInicial = {};

export default function CadastroForm({ origem }) {
  const [state, formAction, pending] = useActionState(cadastrar, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Criar Conta</h1>

        {origem && <input type="hidden" name="origem" value={origem} />}

        <div>
          <label htmlFor="nome" className="block text-sm font-semibold text-navy">
            Nome
          </label>
          <input id="nome" name="nome" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-navy">
            E-mail
          </label>
          <input id="email" name="email" type="email" required className="field" />
        </div>

        <div>
          <label htmlFor="senha" className="block text-sm font-semibold text-navy">
            Senha
          </label>
          <input id="senha" name="senha" type="password" required minLength={6} className="field" />
        </div>

        <div>
          <label htmlFor="contato" className="block text-sm font-semibold text-navy">
            Telefone
          </label>
          <input id="contato" name="contato" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="crp" className="block text-sm font-semibold text-navy">
            CRP (opcional)
          </label>
          <input id="crp" name="crp" type="text" className="field" />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Criando conta..." : "Criar conta grátis"}
        </button>
      </form>

      <div className="w-full max-w-sm flex items-center gap-2 text-xs text-muted my-4">
        <div className="h-px flex-1 bg-gray-200" />
        ou
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form action={entrarComGoogle.bind(null, origem)} className="w-full max-w-sm">
        <button type="submit" className="btn-outline w-full">
          Cadastrar com Google
        </button>
      </form>

      <Link href="/login" className="block text-sm link text-center mt-4">
        Já tem conta? Entrar
      </Link>
    </div>
  );
}
```

Nota: o link "Já tem conta? Entrar" saiu de dentro do `<form>` principal
(onde estava antes) pro final da página — no original ele já estava fora
da lógica de submit (é só um `Link`), então mover não muda comportamento,
só reorganiza o JSX pra caber o bloco do Google entre os dois cards.

- [ ] **Step 2: Verificar que o build passa**

Rodar: `cd web && npm run build`
Esperado: sem erro, `/cadastro` continua na lista de rotas.

- [ ] **Step 3: Commit**

```bash
git add web/components/CadastroForm.js
git commit -m "feat: adiciona cadastro via Google em /cadastro"
```

---

## Task 3: Callback ganha checagem de provisionamento

**Files:**
- Modify: `web/app/auth/callback/route.js`

**Interfaces:**
- Produces: rota continua `GET /auth/callback`, mesmo contrato de antes pra quem já tem `Usuarios` (redireciona pro `next`); novo comportamento só quando `Usuarios` não existe (redireciona pro `/completar-perfil`).

- [ ] **Step 1: Editar a rota**

```js
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: usuarioExistente } = await supabase
        .from("Usuarios")
        .select("id")
        .eq("id_user", user.id)
        .maybeSingle();

      if (!usuarioExistente) {
        return NextResponse.redirect(`${origin}/completar-perfil?next=${encodeURIComponent(next)}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
```

- [ ] **Step 2: Verificar que o build passa**

Rodar: `cd web && npm run build`

- [ ] **Step 3: Verificar a query de provisionamento contra produção com usuário descartável**

Este script cria um usuário Auth descartável (sem senha, via admin), simula
"sem Usuarios ainda" e "com Usuarios já existente", e confirma que a mesma
query usada no Step 1 (`.select("id").eq("id_user", ...).maybeSingle()`)
devolve `null`/uma linha corretamente nos dois casos. Roda de dentro de
`web/` (usa `web/node_modules`):

```js
// scratch-verificar-callback-provisionamento.js
const fs = require("fs");
function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv(".env.local");
const { createClient } = require("./node_modules/@supabase/supabase-js");

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email: `teste-google-callback-${Date.now()}@example.com`,
    email_confirm: true,
  });
  if (erroCriar) throw new Error(erroCriar.message);
  const idUser = criado.user.id;

  // Caso 1: sem Usuarios ainda
  const { data: semUsuario } = await admin
    .from("Usuarios")
    .select("id")
    .eq("id_user", idUser)
    .maybeSingle();
  console.log("Sem Usuarios (esperado null):", semUsuario);

  // Caso 2: com Usuarios existente
  const { data: inserido } = await admin
    .from("Usuarios")
    .insert({ id_user: idUser, nome: "Teste Callback", email: criado.user.email, contato: 11999999999, role: "psicologo", aprovado: false })
    .select("id")
    .single();

  const { data: comUsuario } = await admin
    .from("Usuarios")
    .select("id")
    .eq("id_user", idUser)
    .maybeSingle();
  console.log("Com Usuarios (esperado a linha):", comUsuario);

  // Limpa
  await admin.from("Usuarios").delete().eq("id", inserido.id);
  await admin.auth.admin.deleteUser(idUser);
  console.log("Limpo.");
}
main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

Rodar: `node scratch-verificar-callback-provisionamento.js`
Esperado: `Sem Usuarios (esperado null): null`, depois `Com Usuarios
(esperado a linha): { id: <algum número> }`. Apagar o script depois.

- [ ] **Step 4: Commit**

```bash
git add web/app/auth/callback/route.js
git commit -m "feat: callback OAuth redireciona pra completar-perfil quando Usuarios nao existe"
```

---

## Task 4: Rota `/completar-perfil` — coleta telefone e cria `Usuarios`

**Files:**
- Create: `web/app/completar-perfil/page.js`
- Create: `web/components/CompletarPerfilForm.js`
- Modify: `web/lib/actions/auth.js`

**Interfaces:**
- Consumes: `criarClassificacoesPadrao` de `@/lib/classificacoes-padrao` (já existe, mesmo usado em `cadastrar`).
- Produces: `completarPerfilGoogle(prevState, formData)` — Server Action, retorna `{ error }` em falha ou faz `redirect(next)` em sucesso; componente `CompletarPerfilForm({ nomeSugerido, email, next })`.

- [ ] **Step 1: Adicionar `completarPerfilGoogle` em `web/lib/actions/auth.js`**

Adicionar ao final do arquivo:

```js
export async function completarPerfilGoogle(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nome = formData.get("nome");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
  const next = formData.get("next") || "/";

  const { error } = await supabase.from("Usuarios").insert({
    id_user: user.id,
    nome,
    email: user.email,
    contato: Number(String(contato).replace(/\D/g, "")),
    crp: crp || null,
    role: "psicologo",
    aprovado: false,
  });

  if (error) {
    return { error: "Não foi possível salvar seu cadastro. Tente novamente." };
  }

  await criarClassificacoesPadrao(supabase, user.id).catch(() => {});

  redirect(next);
}
```

Confirmar que o import de `criarClassificacoesPadrao` já está no topo do
arquivo (deve estar, é usado por `cadastrar`).

- [ ] **Step 2: Criar `web/components/CompletarPerfilForm.js`**

```jsx
"use client";

import { useActionState } from "react";
import { completarPerfilGoogle } from "@/lib/actions/auth";

const estadoInicial = {};

export default function CompletarPerfilForm({ nomeSugerido, email, next }) {
  const [state, formAction, pending] = useActionState(completarPerfilGoogle, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Complete seu cadastro</h1>
        <p className="text-sm text-muted">
          Falta só o seu telefone pra terminar de criar sua conta.
        </p>

        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="nome" className="block text-sm font-semibold text-navy">
            Nome
          </label>
          <input id="nome" name="nome" type="text" defaultValue={nomeSugerido} required className="field" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-navy">E-mail</label>
          <p className="field bg-gray-50 text-muted">{email}</p>
        </div>

        <div>
          <label htmlFor="contato" className="block text-sm font-semibold text-navy">
            Telefone
          </label>
          <input id="contato" name="contato" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="crp" className="block text-sm font-semibold text-navy">
            CRP (opcional)
          </label>
          <input id="crp" name="crp" type="text" className="field" />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Salvando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Criar `web/app/completar-perfil/page.js`**

```jsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompletarPerfilForm from "@/components/CompletarPerfilForm";

export default async function PaginaCompletarPerfil({ searchParams }) {
  const params = await searchParams;
  const next = params.next || "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarioExistente } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .maybeSingle();

  if (usuarioExistente) {
    redirect(next);
  }

  const nomeSugerido = user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";

  return <CompletarPerfilForm nomeSugerido={nomeSugerido} email={user.email} next={next} />;
}
```

Esta página fica **fora** do grupo `(app)` de propósito (path
`web/app/completar-perfil/page.js`, não
`web/app/(app)/completar-perfil/page.js`) — não deve passar por
`(app)/layout.js`, que chamaria `buscarUsuarioAtual()` e quebraria antes
da linha em `Usuarios` existir.

- [ ] **Step 4: Verificar que o build passa e a rota aparece fora do grupo `(app)`**

Rodar: `cd web && npm run build`
Esperado: `/completar-perfil` aparece na lista de rotas geradas, sem erro.

- [ ] **Step 5: Verificar o insert contra produção com usuário descartável**

```js
// scratch-verificar-completar-perfil.js
const fs = require("fs");
function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv(".env.local");
const { createClient } = require("./node_modules/@supabase/supabase-js");

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: criado } = await admin.auth.admin.createUser({
    email: `teste-completar-perfil-${Date.now()}@example.com`,
    email_confirm: true,
    user_metadata: { full_name: "Teste Perfil Google" },
  });

  // Mesma logica de completarPerfilGoogle, mas via service_role (nao da
  // pra montar uma sessao real de usuario fora de um browser)
  const { data: inserido, error } = await admin
    .from("Usuarios")
    .insert({
      id_user: criado.user.id,
      nome: criado.user.user_metadata.full_name,
      email: criado.user.email,
      contato: 11988887777,
      crp: null,
      role: "psicologo",
      aprovado: false,
    })
    .select("id, nome, contato, aprovado")
    .single();

  console.log("Insert:", error ? `FALHOU: ${error.message}` : inserido);
  console.log(
    "Esperado: aprovado=false, contato preenchido ->",
    !error && inserido.aprovado === false && inserido.contato === 11988887777 ? "OK" : "FALHOU"
  );

  // Limpa
  if (inserido) await admin.from("Usuarios").delete().eq("id", inserido.id);
  await admin.auth.admin.deleteUser(criado.user.id);
}
main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

Rodar: `node scratch-verificar-completar-perfil.js`
Esperado: conforme os comentários — `OK`. Apagar o script depois.

- [ ] **Step 6: Commit**

```bash
git add web/lib/actions/auth.js web/components/CompletarPerfilForm.js web/app/completar-perfil/page.js
git commit -m "feat: adiciona /completar-perfil pra provisionar Usuarios apos login via Google"
```

---

## Task 5: Configuração externa (Google Cloud + Supabase Auth)

Não é uma task de código — sem ela, os botões existem mas o clique
devolve erro do próprio Supabase (`error=requested path is invalid` ou
similar, provider não habilitado).

- [ ] **Step 1: Criar OAuth Client ID no Google Cloud Console**

Tipo "Web application". Authorized redirect URI:
`https://rohulajgyxdangxfurha.supabase.co/auth/v1/callback` (URL fixa do
Supabase — não é o domínio do app). Guardar o Client ID e o Client Secret
gerados.

- [ ] **Step 2: Habilitar o provider Google no Supabase Auth**

Tentar via Management API primeiro:

```bash
node -e "
(async () => {
  const res = await fetch('https://api.supabase.com/v1/projects/rohulajgyxdangxfurha/config/auth', {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_google_enabled: true,
      external_google_client_id: process.env.GOOGLE_CLIENT_ID,
      external_google_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  console.log(res.status, await res.text());
})();
"
```

Se o token salvo (`SUPABASE_ACCESS_TOKEN`) devolver 401 (já observado
expirado numa sessão anterior), pedir um token novo em
https://supabase.com/dashboard/account/tokens, ou fazer esse passo manual
em Supabase Dashboard → Authentication → Providers → Google.

- [ ] **Step 3: Habilitar "Enable automatic linking"**

Supabase Dashboard → Authentication → Settings → em "Advanced" (ou via
`PATCH` no mesmo endpoint de config de Auth, campo relacionado a account
linking — checar o nome exato do campo na resposta do `GET` da mesma URL
antes de tentar o `PATCH`, pode variar entre versões da API). Sem isso,
um profissional que já tem conta por e-mail/senha corre risco de
duplicidade de cadastro ao tentar "Entrar com Google" com o mesmo e-mail.

- [ ] **Step 4: Verificar a configuração**

```bash
node -e "
(async () => {
  const res = await fetch('https://api.supabase.com/v1/projects/rohulajgyxdangxfurha/config/auth', {
    headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN },
  });
  const data = await res.json();
  console.log('Google habilitado:', data.external_google_enabled);
})();
"
```

Esperado: `true`.

- [ ] **Step 5: Teste manual ponta a ponta (não Playwright — bug de cookie já registrado)**

Com as credenciais configuradas: abrir `/login` num navegador de verdade,
clicar "Entrar com Google" com uma conta Google que nunca logou antes,
confirmar que cai em `/completar-perfil` com o nome pré-preenchido,
preencher telefone, confirmar redirecionamento pro destino e que a
sidebar mostra o aviso de "cadastro pendente de aprovação". Depois, sair
e clicar "Entrar com Google" de novo com a mesma conta — confirmar que
vai direto pro destino, sem passar por `/completar-perfil` de novo.

Este step depende inteiramente dos Steps 1-4 estarem concluídos antes —
não dá pra testar sem as credenciais reais do Google configuradas.

---

## Self-Review

**Spec coverage:** botão único cobrindo login+cadastro (Task 1-2), checagem de provisionamento no callback (Task 3), rota `/completar-perfil` fora do grupo `(app)` (Task 4), configuração externa incluindo automatic linking (Task 5) — todas as seções da spec têm task correspondente.

**Placeholder scan:** nenhum "TBD"/"implementar depois". O único ponto de incerteza real (nome exato do campo de "automatic linking" na API de config do Supabase) está marcado explicitamente como algo a checar na hora, não deixado como lacuna silenciosa.

**Type consistency:** `entrarComGoogle(origem)` definido na Task 1 e consumido com a mesma assinatura nas Tasks 1-2; `completarPerfilGoogle(prevState, formData)` segue o mesmo padrão de `useActionState` já usado em `cadastrar`/`entrar`; `next` como string de URL usado de forma consistente entre Task 3 (callback) e Task 4 (formulário/action).
