# Planos do produto (Psi Gestão / Psi Gestão + Marketing / Psi Marketing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir um campo de plano por usuário (`gestao` / `gestao_marketing` / `marketing`) e restringir o acesso às telas de gestão e ao diretório público de acordo com ele, com o admin atribuindo o plano manualmente.

**Architecture:** Uma migration adiciona `Usuarios.plano`. As ~9 áreas de gestão (Painel, Agenda, Financeiro, Pacientes, Recibos, Recorrências, Consultórios, Pacotes, Configurações) migram para um novo route group `app/(app)/(gestao)/` com um único gate compartilhado; `/diretorio` ganha uma checagem própria simétrica. A sidebar e o admin de profissionais passam a considerar o novo campo.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions, route groups), Supabase Postgres. Sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc com `pg`/`@supabase/supabase-js` (camada de dados) e navegador real (camada de UI/roteamento).

## Global Constraints

- Todo usuário (existente e novo cadastro) nasce `plano = 'gestao'` — decisão explícita do usuário, verificado que 0 perfis estão visíveis no diretório hoje, então não tira acesso real de ninguém.
- Só 3 valores possíveis: `gestao`, `gestao_marketing`, `marketing` — via `check` constraint, sem tabela `Plano` separada.
- `plano === 'marketing'` bloqueia todas as telas de gestão, redirecionando pra `/diretorio`.
- `plano === 'gestao'` bloqueia `/diretorio`, redirecionando pra `/`.
- `plano === 'gestao_marketing'` não tem nenhuma restrição (comportamento de hoje, acesso a tudo).
- `admin/*` continua gated só por `role`, sem relação com `plano` — não mexer nisso.
- Admin pode mudar o plano de qualquer usuário a qualquer momento, sem validação de transição.
- Sem gateway de pagamento, sem autoatendimento de troca de plano — fora de escopo desta entrega.

---

## Task 1: Migration — coluna `plano` em `Usuarios`

**Files:**
- Create: `supabase/migrations/20260813000001_add_plano_usuarios.sql`

**Interfaces:**
- Produces: coluna `plano text not null default 'gestao'` em `public."Usuarios"`, com `check (plano in ('gestao', 'gestao_marketing', 'marketing'))`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Plano do produto: define quais areas do sistema o usuario acessa.
-- 'gestao' = so sistema de gestao (agenda/financeiro/pacientes/etc).
-- 'gestao_marketing' = gestao + diretorio publico (comportamento de hoje).
-- 'marketing' = so diretorio publico, sem acesso as telas de gestao.
-- Nasce 'gestao' pra todo mundo (novo e existente) -- verificado que
-- nenhum perfil esta visivel no diretorio hoje, entao ninguem perde
-- acesso real com esse default.
alter table public."Usuarios"
  add column plano text not null default 'gestao'
    check (plano in ('gestao', 'gestao_marketing', 'marketing'));
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260813000001_add_plano_usuarios.sql', 'utf8');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  await client.query(sql);
  console.log('migration aplicada');
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: imprime `migration aplicada` sem erro.

- [ ] **Step 3: Verificar a coluna e o default nos usuários existentes**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'Usuarios' and column_name = 'plano'\");
  console.table(cols.rows);
  const contagem = await client.query(\"select plano, count(*) from public.\\\"Usuarios\\\" group by plano\");
  console.table(contagem.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: uma linha de coluna (`plano | text | NO | 'gestao'::text`), e a contagem por plano mostra todos os usuários existentes em `gestao`.

- [ ] **Step 4: Testar a constraint com um usuário descartável**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: userData, error: createErr } = await admin.auth.admin.createUser({
    email: 'teste-plano-' + Date.now() + '@example.com', password: 'SenhaTeste123', email_confirm: true
  });
  if (createErr) { console.error('createUser error', createErr); return; }

  const { data: u1, error: e1 } = await admin.from('Usuarios').insert({ id_user: userData.user.id, nome: 'Teste Plano', email: userData.user.email, role: 'psicologo' }).select('plano').single();
  console.log('default sem informar plano (esperado gestao):', u1?.plano, e1?.message || '');

  const { error: e2 } = await admin.from('Usuarios').update({ plano: 'gestao_marketing' }).eq('id_user', userData.user.id);
  console.log('update pra gestao_marketing (esperado sem erro):', e2?.message || 'OK');

  const { error: e3 } = await admin.from('Usuarios').update({ plano: 'invalido' }).eq('id_user', userData.user.id);
  console.log('update pra valor invalido (esperado falhar):', e3?.message);

  await admin.auth.admin.deleteUser(userData.user.id);
  console.log('cleanup done');
})();
"
```

Expected: `default sem informar plano (esperado gestao): gestao`, update pra `gestao_marketing` sem erro, update pra `invalido` falha citando a constraint, cleanup sem erro.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260813000001_add_plano_usuarios.sql && git commit -m "feat: adiciona coluna plano ao usuario"
```

---

## Task 2: Camada de dados e Server Action — atribuir plano

**Files:**
- Modify: `web/lib/data/usuario.js`
- Modify: `web/lib/data/profissionais.js`
- Modify: `web/lib/actions/profissionais.js`

**Interfaces:**
- Consumes: coluna `plano` do Task 1.
- Produces: `buscarUsuarioAtual()` retorna também `plano`. `listarProfissionais()` retorna também `plano` por linha. Nova Server Action `alterarPlano(id, novoPlano)`.

- [ ] **Step 1: Adicionar `plano` ao select de `buscarUsuarioAtual`**

Em `web/lib/data/usuario.js`, trocar a linha do `.select(...)`:

```js
    .select("id, nome, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano")
```

- [ ] **Step 2: Adicionar `plano` ao select de `listarProfissionais`**

Em `web/lib/data/profissionais.js`, trocar a linha do `.select(...)`:

```js
    .select("id, nome, email, contato, role, crp, aprovado, criador_conteudo, plano, created_at")
```

- [ ] **Step 3: Adicionar a Server Action `alterarPlano`**

No fim de `web/lib/actions/profissionais.js`, depois de `alternarCriadorConteudo`:

```js
export async function alterarPlano(id, novoPlano) {
  const supabase = await createClient();

  const { error } = await supabase.from("Usuarios").update({ plano: novoPlano }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/profissionais");
}
```

- [ ] **Step 4: Verificar as 3 mudanças com um usuário descartável**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: userData } = await admin.auth.admin.createUser({
    email: 'teste-plano2-' + Date.now() + '@example.com', password: 'SenhaTeste123', email_confirm: true
  });
  const { data: u } = await admin.from('Usuarios').insert({ id_user: userData.user.id, nome: 'Teste Plano2', email: userData.user.email, role: 'psicologo' }).select('id').single();

  // mesma query que buscarUsuarioAtual faz
  const busca = await admin.from('Usuarios').select('id, nome, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano').eq('id_user', userData.user.id).single();
  console.log('buscarUsuarioAtual inclui plano:', busca.data?.plano, busca.error?.message || '');

  // mesma query que listarProfissionais faz
  const lista = await admin.from('Usuarios').select('id, nome, email, contato, role, crp, aprovado, criador_conteudo, plano, created_at').eq('id', u.id).single();
  console.log('listarProfissionais inclui plano:', lista.data?.plano, lista.error?.message || '');

  // mesma mutacao que alterarPlano faz
  const { error: erroUpdate } = await admin.from('Usuarios').update({ plano: 'marketing' }).eq('id', u.id);
  const { data: depois } = await admin.from('Usuarios').select('plano').eq('id', u.id).single();
  console.log('alterarPlano -> depois do update (esperado marketing):', depois?.plano, erroUpdate?.message || '');

  await admin.auth.admin.deleteUser(userData.user.id);
  console.log('cleanup done');
})();
"
```

Expected: `plano: gestao` nas duas primeiras leituras, `plano: marketing` depois do update, cleanup sem erro.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/usuario.js web/lib/data/profissionais.js web/lib/actions/profissionais.js && git commit -m "feat: expoe plano do usuario e adiciona action pra altera-lo"
```

---

## Task 3: UI de admin — seletor de plano em `/admin/profissionais`

**Files:**
- Create: `web/components/SeletorPlano.js`
- Modify: `web/app/(app)/admin/profissionais/page.js`

**Interfaces:**
- Consumes: `listarProfissionais()` retornando `plano` (Task 2), `alterarPlano(id, novoPlano)` (Task 2).
- Produces: nenhuma interface nova consumida por outra task — ponta de UI.

**Abordagem**: `alterarPlano(id, novoPlano)` recebe os dois valores como argumentos de função, não via `FormData` — não dá pra ligar isso a um `<form action={...}>` simples (que só manda `FormData`, e o valor escolhido no `<select>` precisa virar o segundo argumento dinamicamente). Como a página `admin/profissionais/page.js` é um Server Component, e reagir ao `onChange` de um `<select>` exige um Client Component, o seletor vira um componente novo à parte que chama a Server Action diretamente (Server Actions podem ser importadas e chamadas como funções assíncronas comuns a partir de um Client Component, sem precisar de `<form>`).

- [ ] **Step 1: Criar o componente do seletor**

**Create:** `web/components/SeletorPlano.js`

```js
"use client";

import { alterarPlano } from "@/lib/actions/profissionais";

export default function SeletorPlano({ id, planoAtual }) {
  return (
    <select
      defaultValue={planoAtual}
      onChange={(e) => alterarPlano(id, e.target.value)}
      className="field mt-0 w-auto text-sm"
    >
      <option value="gestao">Psi Gestão</option>
      <option value="gestao_marketing">Psi Gestão + Marketing</option>
      <option value="marketing">Psi Marketing</option>
    </select>
  );
}
```

- [ ] **Step 2: Usar o componente na página de admin**

Em `web/app/(app)/admin/profissionais/page.js`, adicionar o import (`alterarPlano` não é importado aqui — só é usado dentro de `SeletorPlano`):

```js
import SeletorPlano from "@/components/SeletorPlano";
```

E usar `<SeletorPlano id={p.id} planoAtual={p.plano} />` dentro do `<div className="flex items-center gap-3">`, depois do bloco de `criador_conteudo` e antes do fechamento da `</div>` (linha 55-56 hoje):

```jsx
                <SeletorPlano id={p.id} planoAtual={p.plano} />
```

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/components/SeletorPlano.js "web/app/(app)/admin/profissionais/page.js" && git commit -m "feat: admin pode atribuir plano ao profissional em /admin/profissionais"
```

---

## Task 4: Route group `(gestao)` — mover as telas de gestão e adicionar o gate

**Files:**
- Move: `web/app/(app)/page.js` → `web/app/(app)/(gestao)/page.js`
- Move: `web/app/(app)/agenda/` → `web/app/(app)/(gestao)/agenda/`
- Move: `web/app/(app)/configuracoes/` → `web/app/(app)/(gestao)/configuracoes/`
- Move: `web/app/(app)/consultorios/` → `web/app/(app)/(gestao)/consultorios/`
- Move: `web/app/(app)/financeiro/` → `web/app/(app)/(gestao)/financeiro/`
- Move: `web/app/(app)/pacientes/` → `web/app/(app)/(gestao)/pacientes/`
- Move: `web/app/(app)/pacotes/` → `web/app/(app)/(gestao)/pacotes/`
- Move: `web/app/(app)/recibos/` → `web/app/(app)/(gestao)/recibos/`
- Move: `web/app/(app)/recorrencias/` → `web/app/(app)/(gestao)/recorrencias/`
- Move: `web/app/(app)/sessoes/` → `web/app/(app)/(gestao)/sessoes/`
- Create: `web/app/(app)/(gestao)/layout.js`

**Interfaces:**
- Consumes: `buscarUsuarioAtual()` retornando `plano` (Task 2).
- Produces: nenhuma interface nova consumida por outra task.

- [ ] **Step 1: Confirmar que nenhum arquivo dessas pastas usa import relativo**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && grep -rn "from \"\.\./\|from '\.\./" "app/(app)/agenda" "app/(app)/configuracoes" "app/(app)/consultorios" "app/(app)/financeiro" "app/(app)/pacientes" "app/(app)/pacotes" "app/(app)/recibos" "app/(app)/recorrencias" "app/(app)/sessoes" "app/(app)/page.js"
```

Expected: nenhuma saída (todos os imports já usam o alias `@/...`, que não depende de profundidade de pasta — confirmado antes de escrever este plano). Se aparecer alguma linha, pare e avise — os imports relativos vão quebrar depois do `git mv` e precisam ser corrigidos pra `@/...` como parte deste mesmo passo.

- [ ] **Step 2: Mover as pastas com `git mv`**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web"
mkdir -p "app/(app)/(gestao)"
git mv "app/(app)/page.js" "app/(app)/(gestao)/page.js"
git mv "app/(app)/agenda" "app/(app)/(gestao)/agenda"
git mv "app/(app)/configuracoes" "app/(app)/(gestao)/configuracoes"
git mv "app/(app)/consultorios" "app/(app)/(gestao)/consultorios"
git mv "app/(app)/financeiro" "app/(app)/(gestao)/financeiro"
git mv "app/(app)/pacientes" "app/(app)/(gestao)/pacientes"
git mv "app/(app)/pacotes" "app/(app)/(gestao)/pacotes"
git mv "app/(app)/recibos" "app/(app)/(gestao)/recibos"
git mv "app/(app)/recorrencias" "app/(app)/(gestao)/recorrencias"
git mv "app/(app)/sessoes" "app/(app)/(gestao)/sessoes"
```

- [ ] **Step 3: Criar o layout com o gate**

```js
// web/app/(app)/(gestao)/layout.js
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutGestao({ children }) {
  const usuario = await buscarUsuarioAtual();

  if (usuario.plano === "marketing") {
    redirect("/diretorio");
  }

  return children;
}
```

- [ ] **Step 4: Verificar que a estrutura de pastas ficou correta**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && find "app/(app)" -maxdepth 1 -mindepth 1
```

Expected: lista exatamente `app/(app)/admin`, `app/(app)/diretorio`, `app/(app)/(gestao)`, `app/(app)/layout.js` — nenhuma das 9 pastas movidas nem `page.js` deve continuar direto em `app/(app)/`.

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && find "app/(app)/(gestao)" -maxdepth 1 -mindepth 1
```

Expected: `app/(app)/(gestao)/agenda`, `configuracoes`, `consultorios`, `financeiro`, `pacientes`, `pacotes`, `recibos`, `recorrencias`, `sessoes`, `layout.js`, `page.js` — 11 entradas.

**Nota sobre teste deste gate**: como o build local deste projeto está quebrado por um motivo pré-existente e não relacionado (falha ao buscar fontes do Google, sem acesso de rede neste ambiente), não é possível rodar `next dev`/`next build` aqui pra confirmar que as rotas continuam resolvendo `/agenda`, `/financeiro` etc. exatamente como antes (route groups do Next.js não mudam a URL, mas isso precisa ser confirmado contra um servidor rodando de verdade). Essa confirmação fica pra uma task de verificação end-to-end no navegador, depois do deploy — não é possível fechar esta task com 100% de certeza sem isso. Reporte `DONE_WITH_CONCERNS` citando esse limite, não `DONE`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add -A "web/app/(app)" && git commit -m "feat: agrupa telas de gestao sob route group (gestao) com gate por plano"
```

---

## Task 5: Gate em `/diretorio` e sidebar consciente de plano

**Files:**
- Modify: `web/app/(app)/diretorio/page.js`
- Modify: `web/app/(app)/layout.js`
- Modify: `web/components/SidebarNav.js`

**Interfaces:**
- Consumes: `usuario.plano` (Task 2), `buscarUsuarioAtual()`.
- Produces: nenhuma interface nova consumida por outra task.

- [ ] **Step 1: Adicionar o gate em `/diretorio`**

Em `web/app/(app)/diretorio/page.js`, adicionar `redirect` ao import do `next/navigation` (ou criar o import se não existir) e, logo depois de buscar `usuario`, adicionar:

```js
  if (usuario.plano === "gestao") {
    redirect("/");
  }
```

(inserir essa checagem logo após a linha que já busca `buscarUsuarioAtual()` nesse arquivo — antes de buscar `buscarMeuPerfil()`/renderizar qualquer coisa.)

- [ ] **Step 2: Passar `plano` pro `SidebarNav`**

Em `web/app/(app)/layout.js`, trocar a linha do `<SidebarNav ...>`:

```jsx
      <SidebarNav ehAdmin={usuario.role === "admin"} nome={usuario.nome} papel={usuario.role} plano={usuario.plano} />
```

- [ ] **Step 3: Filtrar a navegação por plano em `SidebarNav.js`**

Em `web/components/SidebarNav.js`, trocar a assinatura da função (linha `export default function SidebarNav({ ehAdmin, nome, papel }) {`):

```js
export default function SidebarNav({ ehAdmin, nome, papel, plano }) {
```

E trocar o cálculo de `itens` (hoje):

```js
  const itens = ehAdmin
    ? [...ITENS_NAV, { href: "/admin/profissionais", label: "Administração", Icone: IconeAdmin }]
    : ITENS_NAV;
```

Por:

```js
  const itens =
    plano === "marketing"
      ? ITENS_NAV.filter((item) => item.href === "/diretorio")
      : ehAdmin
        ? [...ITENS_NAV, { href: "/admin/profissionais", label: "Administração", Icone: IconeAdmin }]
        : ITENS_NAV;
```

- [ ] **Step 4: Verificar a lógica de filtro isoladamente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const ITENS_NAV = [
  { href: '/', label: 'Painel' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/diretorio', label: 'Diretório' },
  { href: '/configuracoes/whatsapp', label: 'WhatsApp' },
];

function calcularItens(plano, ehAdmin) {
  return plano === 'marketing'
    ? ITENS_NAV.filter((item) => item.href === '/diretorio')
    : ehAdmin
      ? [...ITENS_NAV, { href: '/admin/profissionais', label: 'Administração' }]
      : ITENS_NAV;
}

console.log('marketing:', calcularItens('marketing', false).map((i) => i.href));
console.log('gestao, nao-admin:', calcularItens('gestao', false).map((i) => i.href));
console.log('gestao_marketing, admin:', calcularItens('gestao_marketing', true).map((i) => i.href));
"
```

Expected: `marketing: [ '/diretorio' ]`, `gestao, nao-admin:` lista todos os 4 itens do array de exemplo, `gestao_marketing, admin:` lista os 4 + `/admin/profissionais`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add "web/app/(app)/diretorio/page.js" "web/app/(app)/layout.js" web/components/SidebarNav.js && git commit -m "feat: gate de plano em /diretorio e sidebar filtra menu por plano"
```

---

## Task 6: Verificação end-to-end no navegador

**Files:** nenhum (só verificação manual/via browser).

**Interfaces:**
- Consumes: todas as anteriores, rodando juntas via requisição HTTP real.

- [ ] **Step 1: Pedir deploy**

Avisar o usuário para clicar em "Deploy" no EasyPanel — as rotas movidas (Task 4) só podem ser confirmadas contra um servidor real.

- [ ] **Step 2: Criar um profissional descartável e testar os 3 planos**

Via navegador (chrome-devtools MCP, contexto isolado) ou script + login manual: criar um usuário de teste com `plano = 'gestao'` (default). Logar como ele e confirmar: consegue abrir `/`, `/agenda`, `/financeiro`, `/pacientes` etc. normalmente; ao tentar abrir `/diretorio` diretamente pela URL, é redirecionado pra `/`; a sidebar não mostra "Diretório".

Em `/admin/profissionais`, mudar o plano desse usuário de teste pra `marketing` usando o novo seletor. Recarregar a sessão do usuário de teste: agora `/diretorio` abre normalmente, e tentar abrir `/agenda` (ou qualquer outra tela de gestão) redireciona pra `/diretorio`; a sidebar mostra só "Diretório" (e "Sair").

Mudar pra `gestao_marketing`: confirmar que agora todas as telas abrem, incluindo `/diretorio`, sem nenhum redirecionamento, e a sidebar mostra o menu completo.

- [ ] **Step 3: Confirmar que um usuário real existente não foi afetado**

Conferir (via query direta, sem precisar logar) que os usuários que já existiam antes desta mudança estão todos com `plano = 'gestao'` e continuam com `aprovado`/`role` inalterados.

- [ ] **Step 4: Limpeza**

Excluir o usuário de teste (auth + linha em `Usuarios`) via script Node com a service role key.
