# Início de operação via WhatsApp — backend (migrations, RPCs, rotas Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir todo o backend (banco + rotas Next.js) que permite uma conta nascer 100% pelo WhatsApp — cadastro com senha aleatória + link mágico, 3 RPCs de onboarding guiado (consultório/paciente/conta bancária) isentas da checagem de plano enquanto o onboarding não termina, e o ponto de retomada em `/auth/callback`/`/auth/confirm` que avisa o n8n quando o link é clicado.

**Architecture:** Extensão de `agent_sessions` com 6 colunas novas (estado de onboarding, validação de segurança, anti-abuso). Rota nova `POST /api/agent/onboarding` (mesmo padrão de segredo compartilhado — `AGENT_TOOL_SECRET`/`x-agent-secret` — de `/api/agent/call-tool`) concentra toda chamada à Auth Admin API (criar usuário, magic link). 3 RPCs novas seguem exatamente o padrão de segurança das 16 já existentes. `/auth/callback` e `/auth/confirm` ganham uma chamada de saída (fire-and-forget) pra um webhook do n8n avisando que o link foi clicado.

**Tech Stack:** Supabase Postgres (PL/pgSQL, RLS), Next.js 16 App Router (Route Handlers), `@supabase/supabase-js` (client admin service-role já existente + client anon novo), scripts Node ad-hoc (`pg`) pra aplicar/verificar migrations — mesmo padrão de todos os planos anteriores deste projeto.

**Spec:** `docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md`

**Fora deste plano** (mesma decisão de decomposição já usada no item 13 original — `2026-08-17-agente-whatsapp-rpcs.md` deixou o workflow n8n pra `2026-08-19-agente-whatsapp-n8n-workflow.md`): o workflow n8n novo (`WA - Onboarding`), as extensões do `WA - Inbound Router` (checagem de janela de 30 dias, diferenciação "já tenho conta"/"conta nova" por linguagem natural) e do `WA - Agent Psicólogo` (3 nós de tool novos + tradução dos códigos de erro novos no system prompt) — tudo isso é construído via API do n8n, depende de decisões operacionais de sequência de deploy, e só faz sentido depois que este backend estiver aplicado e verificado. Vira um plano próprio depois.

## Global Constraints

- Toda função RPC nova segue o padrão de `supabase/migrations/20260727000002_create_agent_rpc_functions.sql`: `language plpgsql security definer set search_path = public`, primeiro parâmetro `p_whatsapp_number text`, termina com seu próprio par `revoke all on function ... from public, anon, authenticated;` + `grant execute on function ... to service_role;`.
- Erros de negócio são sempre `raise exception '<CODIGO_EM_MAIUSCULO>' using errcode = 'P0001';`.
- **Códigos de erro desta entrega** (`EMAIL_JA_CADASTRADO`, `LIMITE_TENTATIVAS_CADASTRO` já catalogados na spec; mais 5 de plumbing decididos durante este plano, não elevados a nível de RPC porque só ocorrem na rota Next.js): `NOME_OBRIGATORIO`/`BANCO_OBRIGATORIO` (RPCs, validação de string vazia), `DADOS_INCOMPLETOS` (rota, `nome`/`email` ausentes), `ERRO_CRIAR_CONTA` (rota, falha inesperada do Auth Admin/insert), `WHATSAPP_NAO_VINCULADO` (rota, reenvio/revalidação de número sem `agent_sessions`), `CORPO_INVALIDO`/`ACAO_DESCONHECIDA`/`WHATSAPP_NUMBER_AUSENTE` (rota, mesmo padrão de `/api/agent/call-tool`).
- **`ONBOARDING_ETAPA_INVALIDA`, catalogado na spec como defesa em profundidade, não é implementado neste plano** — a isenção de plano já é controlada inteiramente pela checagem em `/api/agent/call-tool` (Task 6), que é o único ponto de entrada das 3 tools novas; uma segunda checagem dentro de cada RPC seria redundante (YAGNI). Revisitar só se surgir um caminho de chamada que não passe por essa rota.
- **`codigo` de `ContaFinanceira` criada via WhatsApp**: `'C' || lpad(sequencial, 3, '0')` por `owner` (`C001`, `C002`, ...) — não existe convenção prévia no código pra seguir, decisão nova documentada na spec.
- Owner é sempre resolvido a partir do `whatsapp_number` verificado (`_agent_get_owner_uuid`/query direta em `Usuarios`) — nunca recebido como parâmetro do LLM.
- **Isenção de plano durante onboarding** (decisão do usuário, 2026-09-04): as 3 tools novas só ignoram `PLANOS[...].temWhatsapp` enquanto `agent_sessions.onboarding_etapa <> 'concluido'`. Depois de concluído, exigem plano pago como as 16 tools existentes.
- Sem framework de teste automatizado (convenção já estabelecida no projeto) — toda verificação é script direto (Postgres/`pg`, `@supabase/supabase-js`) ou `curl` contra `next build && next start` local, nunca contra `next dev` (regra do projeto: nunca testar contra dev server).
- Conexão Postgres direta pra aplicar/verificar migrations: `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.rohulajgyxdangxfurha.supabase.co:5432/postgres` (`SUPABASE_DB_PASSWORD` já disponível no ambiente). `web/.env.local` tem `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` — lidos pelos scripts de verificação via `@supabase/supabase-js`.
- **`AGENT_TOOL_SECRET` não existe em `web/.env.local` local** (só em produção/EasyPanel) — os testes de `curl` deste plano contra o servidor local precisam setar essa env var manualmente na sessão do build/start (`$env:AGENT_TOOL_SECRET` no PowerShell), nunca gravá-la no `.env.local`.
- **Env vars novas desta entrega** (documentar em `docs/status-implementacao.md`, Task 7, mesmo formato das já existentes): `N8N_ONBOARDING_SECRET`/`N8N_ONBOARDING_CONTINUE_URL` — usadas por `/auth/callback`/`/auth/confirm` pra avisar o workflow `WA - Onboarding` (que só existe no plano seguinte, fora deste). Enquanto essas duas env vars não existirem em nenhum ambiente, a chamada falha silenciosamente (log de erro, não bloqueia o redirect do usuário) — comportamento intencional, não um bug a corrigir agora.
- Schema confirmado de `Usuarios` (colunas relevantes): `id bigint`, `id_user uuid`, `nome text`, `email text`, `contato bigint`, `crp text`, `role text`, `aprovado boolean`, `whatsapp_number text`, `whatsapp_verified boolean`, `plano text` (default `'gratis'`, ver `PLANOS` em `web/lib/planos.js` — só `gestao`/`gestao_marketing` têm `temWhatsapp: true`).
- Schema confirmado de `agent_sessions` hoje: `whatsapp_number text primary key`, `usuario_id bigint references "Usuarios"(id) on delete cascade`, `consultorio_ativo_id bigint references "Consultorio"(id)`, `updated_at timestamptz not null default now()`. RLS já é deny-all pra `anon`/`authenticated` (`20260727000004_lockdown_agent_tables.sql`) — as colunas novas da Task 1 herdam essa proteção automaticamente, sem precisar mexer em RLS/grants.

---

## Task 1: Migration — 6 colunas novas em `agent_sessions`

**Files:**
- Create: `supabase/migrations/20260904000001_add_onboarding_columns_agent_sessions.sql`

**Interfaces:**
- Produces: colunas `ultima_interacao_em timestamptz`, `ultima_validacao_seguranca_em timestamptz`, `onboarding_etapa text`, `link_confirmacao_pendente boolean not null default false`, `tentativas_cadastro int not null default 0`, `tentativas_cadastro_desde timestamptz` em `agent_sessions`. Consumidas por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260904000001_add_onboarding_columns_agent_sessions.sql
--
-- Suporte ao cadastro/onboarding/revalidacao 100% via WhatsApp (spec
-- docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md):
-- ultima_interacao_em/ultima_validacao_seguranca_em alimentam a janela de
-- 30 dias de revalidacao; onboarding_etapa guarda o progresso do
-- onboarding guiado (null -> aguardando_confirmacao_email -> consultorio
-- -> paciente -> conta -> concluido); link_confirmacao_pendente e como
-- /auth/callback e /auth/confirm sabem que um clique de link precisa
-- acordar o webhook do n8n; tentativas_cadastro/tentativas_cadastro_desde
-- implementam o limite anti-abuso de 3 criacoes de conta por numero em
-- 24h. RLS ja e deny-all pra anon/authenticated nesta tabela
-- (20260727000004_lockdown_agent_tables.sql), colunas novas herdam isso
-- automaticamente.
alter table agent_sessions
  add column ultima_interacao_em timestamptz,
  add column ultima_validacao_seguranca_em timestamptz,
  add column onboarding_etapa text,
  add column link_confirmacao_pendente boolean not null default false,
  add column tentativas_cadastro int not null default 0,
  add column tentativas_cadastro_desde timestamptz;
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260904000001_add_onboarding_columns_agent_sessions.sql', 'utf8');
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

- [ ] **Step 3: Verificar as 6 colunas**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'agent_sessions' order by ordinal_position\");
  console.table(cols.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: 10 colunas no total (4 originais + 6 novas), com `link_confirmacao_pendente`/`tentativas_cadastro` mostrando `is_nullable = NO` e os defaults corretos (`false`/`0`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904000001_add_onboarding_columns_agent_sessions.sql && git commit -m "feat(whatsapp-agent): adiciona colunas de onboarding/revalidacao em agent_sessions"
```

---

## Task 2: RPC `agent_criar_consultorio`

**Files:**
- Create: `supabase/migrations/20260904000002_add_agent_criar_consultorio.sql`

**Interfaces:**
- Consumes: `Usuarios` (`id`, `id_user`, `contato`, `email`, `whatsapp_number`, `whatsapp_verified`).
- Produces: `agent_criar_consultorio(p_whatsapp_number text, p_nome text, p_telefone text default null, p_email_atendimento text default null, p_endereco text default null) returns bigint`. Consumida pela Task 6 (allowlist) e pelo plano de n8n futuro.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260904000002_add_agent_criar_consultorio.sql
create or replace function public.agent_criar_consultorio(
  p_whatsapp_number text,
  p_nome text,
  p_telefone text default null,
  p_email_atendimento text default null,
  p_endereco text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario record;
  v_id bigint;
begin
  select id, id_user, contato, email into v_usuario
  from "Usuarios"
  where whatsapp_number = p_whatsapp_number and whatsapp_verified = true;

  if v_usuario.id_user is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  insert into "Consultorio" (nome, telefone, email_atendimento, endereco, owner)
  values (
    btrim(p_nome),
    coalesce(nullif(btrim(p_telefone), ''), v_usuario.contato::text),
    coalesce(nullif(btrim(p_email_atendimento), ''), v_usuario.email),
    nullif(btrim(p_endereco), ''),
    v_usuario.id_user
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.agent_criar_consultorio(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_criar_consultorio(text, text, text, text, text) to service_role;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260904000002_add_agent_criar_consultorio.sql', 'utf8');
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

Expected: `migration aplicada` sem erro.

- [ ] **Step 3: Testar com dados descartáveis (profissional de teste)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
const numero = '5511900000001';

(async () => {
  const { data: authUser, error: eAuth } = await admin.auth.admin.createUser({ email: 'teste-onboarding-consultorio@example.com', password: 'senha-teste-descartavel-123', email_confirm: true });
  if (eAuth) { console.error('erro criar auth user', eAuth); process.exit(1); }

  const { data: usuario, error: eUsuario } = await admin.from('Usuarios').insert({
    id_user: authUser.user.id, nome: 'Teste Onboarding', email: 'teste-onboarding-consultorio@example.com',
    contato: 5511999990000, role: 'psicologo', aprovado: false,
    whatsapp_number: numero, whatsapp_verified: true,
  }).select('id').single();
  if (eUsuario) { console.error('erro criar Usuarios', eUsuario); process.exit(1); }

  const { data: id, error: eRpc } = await admin.rpc('agent_criar_consultorio', { p_whatsapp_number: numero, p_nome: 'Consultório Teste' });
  console.log('consultorio criado (esperado sem erro, telefone/email herdados):', id, eRpc?.message || '');

  const { data: consultorio } = await admin.from('Consultorio').select('nome, telefone, email_atendimento, owner').eq('id', id).single();
  console.log('herdou telefone/email do usuario (esperado true):', consultorio.telefone === '5511999990000' && consultorio.email_atendimento === 'teste-onboarding-consultorio@example.com', consultorio);

  const { error: eNome } = await admin.rpc('agent_criar_consultorio', { p_whatsapp_number: numero, p_nome: '   ' });
  console.log('nome vazio rejeitado (esperado NOME_OBRIGATORIO):', eNome?.message);

  await admin.from('Consultorio').delete().eq('id', id);
  await admin.from('Usuarios').delete().eq('id', usuario.id);
  await admin.auth.admin.deleteUser(authUser.user.id);
  console.log('dados de teste limpos');
})();
"
```

Expected: consultório criado sem erro, telefone/e-mail herdados de `Usuarios` quando omitidos, nome vazio/espaço rejeitado com `NOME_OBRIGATORIO`, limpeza confirmada sem erro.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904000002_add_agent_criar_consultorio.sql && git commit -m "feat(whatsapp-agent): adiciona RPC agent_criar_consultorio"
```

---

## Task 3: RPC `agent_criar_paciente`

**Files:**
- Create: `supabase/migrations/20260904000003_add_agent_criar_paciente.sql`

**Interfaces:**
- Consumes: `_agent_get_owner_uuid(text)` (já existe).
- Produces: `agent_criar_paciente(p_whatsapp_number text, p_nome text, p_telefone text default null, p_email text default null, p_valor_sessao numeric default null, p_consultorio_id bigint default null) returns bigint`.

**Correção (descoberta durante a execução, 2026-09-04)**: `_agent_resolve_consultorio`
foi **removida** por `supabase/migrations/20260827000002_agent_rpc_remove_consultorio_scope.sql`,
posterior à spec original de 2026-08-17 que este plano herdou sem
cross-check — o agente de WhatsApp passou a escopar só por `owner`
(consultório era um recorte de UX, nunca a barreira de segurança real, e
foi removido, junto com `agent_listar_consultorios`,
`agent_definir_consultorio_ativo` e `agent_sessions.consultorio_ativo_id`).
`agent_criar_paciente` resolve consultório **inline**, sem essa função e
sem erro de ambiguidade (mesmo espírito da arquitetura atual): se
`p_consultorio_id` for informado, valida contra o owner; senão, pega o
primeiro consultório do owner (por `id`); se não existir nenhum,
`SEM_CONSULTORIO_CADASTRADO`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260904000003_add_agent_criar_paciente.sql
create or replace function public.agent_criar_paciente(
  p_whatsapp_number text,
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_valor_sessao numeric default null,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_consultorio_id bigint;
  v_paciente_id bigint;
  v_responsavel_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  if p_consultorio_id is not null then
    select id into v_consultorio_id
    from "Consultorio"
    where id = p_consultorio_id and owner = v_owner;

    if v_consultorio_id is null then
      raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
    end if;
  else
    select id into v_consultorio_id
    from "Consultorio"
    where owner = v_owner
    order by id
    limit 1;

    if v_consultorio_id is null then
      raise exception 'SEM_CONSULTORIO_CADASTRADO' using errcode = 'P0001';
    end if;
  end if;

  insert into "Paciente" (nome, telefone, email, valor_sessao, consultorio, owner)
  values (
    btrim(p_nome),
    nullif(btrim(p_telefone), ''),
    nullif(btrim(p_email), ''),
    p_valor_sessao,
    v_consultorio_id,
    v_owner
  )
  returning id into v_paciente_id;

  -- Mesma cascata de criarPaciente (web/lib/actions/pacientes.js): todo
  -- paciente novo ganha um ResponsavelFinanceiro proprio ja vinculado.
  insert into "ResponsavelFinanceiro" (nome, paciente_vinculado, owner)
  values (btrim(p_nome), v_paciente_id, v_owner)
  returning id into v_responsavel_id;

  insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
  values (v_paciente_id, v_responsavel_id, v_owner);

  return v_paciente_id;
end;
$$;

revoke all on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) from public, anon, authenticated;
grant execute on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) to service_role;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260904000003_add_agent_criar_paciente.sql', 'utf8');
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

Expected: `migration aplicada` sem erro.

- [ ] **Step 3: Testar com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
const numero = '5511900000002';

(async () => {
  const { data: authUser } = await admin.auth.admin.createUser({ email: 'teste-onboarding-paciente@example.com', password: 'senha-teste-descartavel-123', email_confirm: true });
  const { data: usuario } = await admin.from('Usuarios').insert({
    id_user: authUser.user.id, nome: 'Teste Onboarding Paciente', email: 'teste-onboarding-paciente@example.com',
    contato: 5511999990001, role: 'psicologo', aprovado: false, whatsapp_number: numero, whatsapp_verified: true,
  }).select('id').single();
  const { data: consultorio } = await admin.from('Consultorio').insert({ nome: 'Consultório Teste Paciente', owner: authUser.user.id }).select('id').single();

  const { data: pacienteId, error: eRpc } = await admin.rpc('agent_criar_paciente', { p_whatsapp_number: numero, p_nome: 'Maria Teste' });
  console.log('paciente criado só com nome (esperado sem erro):', pacienteId, eRpc?.message || '');

  const { data: paciente } = await admin.from('Paciente').select('nome, telefone, email, valor_sessao, consultorio').eq('id', pacienteId).single();
  console.log('telefone/email/valor_sessao nulos quando omitidos (esperado true):', paciente.telefone === null && paciente.email === null && paciente.valor_sessao === null, paciente);

  const { data: vinculo } = await admin.from('PacienteResponsavelFinanceiro').select('responsavel').eq('paciente', pacienteId).single();
  const { data: responsavel } = await admin.from('ResponsavelFinanceiro').select('nome').eq('id', vinculo.responsavel).single();
  console.log('cascata ResponsavelFinanceiro criada (esperado nome = Maria Teste):', responsavel.nome);

  await admin.from('PacienteResponsavelFinanceiro').delete().eq('paciente', pacienteId);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', vinculo.responsavel);
  await admin.from('Paciente').delete().eq('id', pacienteId);
  await admin.from('Consultorio').delete().eq('id', consultorio.id);
  await admin.from('Usuarios').delete().eq('id', usuario.id);
  await admin.auth.admin.deleteUser(authUser.user.id);
  console.log('dados de teste limpos');
})();
"
```

Expected: paciente criado só com nome, campos opcionais `null`, cascata de `ResponsavelFinanceiro`/`PacienteResponsavelFinanceiro` confirmada, limpeza sem erro.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904000003_add_agent_criar_paciente.sql && git commit -m "feat(whatsapp-agent): adiciona RPC agent_criar_paciente"
```

---

## Task 4: RPC `agent_criar_conta_bancaria`

**Files:**
- Create: `supabase/migrations/20260904000004_add_agent_criar_conta_bancaria.sql`

**Interfaces:**
- Consumes: `_agent_get_owner_uuid(text)` (já existe).
- Produces: `agent_criar_conta_bancaria(p_whatsapp_number text, p_nome text, p_banco text, p_agencia text default null, p_numero text default null, p_tipo text default null) returns bigint`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260904000004_add_agent_criar_conta_bancaria.sql
create or replace function public.agent_criar_conta_bancaria(
  p_whatsapp_number text,
  p_nome text,
  p_banco text,
  p_agencia text default null,
  p_numero text default null,
  p_tipo text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_proximo int;
  v_codigo text;
  v_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  if p_banco is null or btrim(p_banco) = '' then
    raise exception 'BANCO_OBRIGATORIO' using errcode = 'P0001';
  end if;

  select count(*) + 1 into v_proximo from "ContaFinanceira" where owner = v_owner;
  v_codigo := 'C' || lpad(v_proximo::text, 3, '0');

  insert into "ContaFinanceira" (codigo, nome, banco, agencia, numero, tipo, owner)
  values (
    v_codigo,
    btrim(p_nome),
    btrim(p_banco),
    nullif(btrim(p_agencia), ''),
    nullif(btrim(p_numero), ''),
    nullif(btrim(p_tipo), ''),
    v_owner
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.agent_criar_conta_bancaria(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_criar_conta_bancaria(text, text, text, text, text, text) to service_role;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260904000004_add_agent_criar_conta_bancaria.sql', 'utf8');
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

Expected: `migration aplicada` sem erro.

- [ ] **Step 3: Testar sequencial de código e obrigatoriedade nome+banco**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
const numero = '5511900000003';

(async () => {
  const { data: authUser } = await admin.auth.admin.createUser({ email: 'teste-onboarding-conta@example.com', password: 'senha-teste-descartavel-123', email_confirm: true });
  const { data: usuario } = await admin.from('Usuarios').insert({
    id_user: authUser.user.id, nome: 'Teste Onboarding Conta', email: 'teste-onboarding-conta@example.com',
    contato: 5511999990002, role: 'psicologo', aprovado: false, whatsapp_number: numero, whatsapp_verified: true,
  }).select('id').single();

  const { data: id1 } = await admin.rpc('agent_criar_conta_bancaria', { p_whatsapp_number: numero, p_nome: 'Conta Corrente', p_banco: 'Nubank' });
  const { data: c1 } = await admin.from('ContaFinanceira').select('codigo, agencia, numero, tipo').eq('id', id1).single();
  console.log('1ª conta (esperado codigo C001, resto null):', c1);

  const { data: id2 } = await admin.rpc('agent_criar_conta_bancaria', { p_whatsapp_number: numero, p_nome: 'Poupança', p_banco: 'Itaú' });
  const { data: c2 } = await admin.from('ContaFinanceira').select('codigo').eq('id', id2).single();
  console.log('2ª conta (esperado codigo C002):', c2);

  const { error: eSemBanco } = await admin.rpc('agent_criar_conta_bancaria', { p_whatsapp_number: numero, p_nome: 'Sem banco', p_banco: '' });
  console.log('banco vazio rejeitado (esperado BANCO_OBRIGATORIO):', eSemBanco?.message);

  await admin.from('ContaFinanceira').delete().in('id', [id1, id2]);
  await admin.from('Usuarios').delete().eq('id', usuario.id);
  await admin.auth.admin.deleteUser(authUser.user.id);
  console.log('dados de teste limpos');
})();
"
```

Expected: `C001`, depois `C002` (sequencial por owner), banco vazio rejeitado com `BANCO_OBRIGATORIO`, limpeza sem erro.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904000004_add_agent_criar_conta_bancaria.sql && git commit -m "feat(whatsapp-agent): adiciona RPC agent_criar_conta_bancaria"
```

---

## Task 5: Client Supabase anon novo (`createAnonClient`)

**Files:**
- Create: `web/lib/supabase/anon.js`

**Interfaces:**
- Produces: `export function createAnonClient()` — client `@supabase/supabase-js` com a chave anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), sessão não persistida. Consumido pela Task 6 (`/api/agent/onboarding`) pra chamar `auth.signInWithOtp` (magic link) sem depender de cookies de sessão de navegador — diferente de `web/lib/supabase/server.js` (cookie-based, pensado pra Server Components/Actions), este contexto é uma API Route chamada pelo n8n, sem cookies de navegador relevantes.

- [ ] **Step 1: Criar o arquivo**

```js
// web/lib/supabase/anon.js
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client stateless com a chave anon -- usado só por rotas de API chamadas
// por integrações externas (n8n), nunca por Server Components/Actions
// (que devem usar web/lib/supabase/server.js, cookie-based). Precisa da
// chave anon (não service-role) porque auth.signInWithOtp é uma operação
// pública do GoTrue, e usar o client admin aqui misturaria os dois papéis
// sem necessidade.
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 2: Verificar que o projeto builda sem erro**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build conclui sem erro (o arquivo novo não é importado por ninguém ainda, então isso só confirma que não quebrou nada).

- [ ] **Step 3: Commit**

```bash
git add web/lib/supabase/anon.js && git commit -m "feat(whatsapp-agent): adiciona client Supabase anon stateless"
```

---

## Task 6: Rota `POST /api/agent/onboarding`

**Files:**
- Create: `web/app/api/agent/onboarding/route.js`

**Interfaces:**
- Consumes: `createAdminClient` (`web/lib/supabase/admin.js`), `createAnonClient` (Task 5), `criarClassificacoesPadrao` (`web/lib/classificacoes-padrao.js`, já existe — mesma função usada por `cadastrar`/`convidarProfissional`), RPCs de `Usuarios`/`agent_sessions` via client admin (sem RPC dedicada — inserts/updates diretos, mesmo padrão de `convidarProfissional`).
- Produces: endpoint `POST /api/agent/onboarding`, header `x-agent-secret` (reaproveita `AGENT_TOOL_SECRET`, mesmo segredo de `/api/agent/call-tool` — mesma direção de chamada, n8n → Next.js). Corpo `{ acao: "criar_conta" | "reenviar_link" | "revalidar", whatsapp_number, nome?, email? }`. Resposta sempre HTTP 200 em erro de negócio (`{ success: false, error_code }`), 401/400 só pra erro de transporte — mesmo contrato de `/api/agent/call-tool`. Será consumida pelo workflow n8n do plano seguinte (fora deste plano).

- [ ] **Step 1: Escrever a rota**

```js
// web/app/api/agent/onboarding/route.js
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { criarClassificacoesPadrao } from "@/lib/classificacoes-padrao";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function checarLimiteTentativas(admin, whatsappNumber) {
  const { data: sessaoAtual } = await admin
    .from("agent_sessions")
    .select("tentativas_cadastro, tentativas_cadastro_desde")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  const agora = new Date();
  const janelaAtiva =
    sessaoAtual?.tentativas_cadastro_desde &&
    agora.getTime() - new Date(sessaoAtual.tentativas_cadastro_desde).getTime() < 24 * 60 * 60 * 1000;

  const tentativas = janelaAtiva ? (sessaoAtual.tentativas_cadastro ?? 0) + 1 : 1;
  const desde = janelaAtiva ? sessaoAtual.tentativas_cadastro_desde : agora.toISOString();

  if (tentativas > 3) {
    return { bloqueado: true };
  }

  await admin
    .from("agent_sessions")
    .upsert(
      { whatsapp_number: whatsappNumber, tentativas_cadastro: tentativas, tentativas_cadastro_desde: desde },
      { onConflict: "whatsapp_number" }
    );

  return { bloqueado: false };
}

async function enviarLinkMagico(email) {
  const anon = createAnonClient();
  await anon.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${ORIGIN}/auth/callback?next=/`, shouldCreateUser: false },
  });
}

async function criarConta(admin, { whatsapp_number, nome, email }) {
  if (!nome || !email) {
    return Response.json({ success: false, error_code: "DADOS_INCOMPLETOS" }, { status: 400 });
  }

  const { bloqueado } = await checarLimiteTentativas(admin, whatsapp_number);
  if (bloqueado) {
    return Response.json({ success: false, error_code: "LIMITE_TENTATIVAS_CADASTRO" }, { status: 200 });
  }

  const senhaAleatoria = randomBytes(24).toString("hex");
  const { data: criado, error: erroCreate } = await admin.auth.admin.createUser({
    email,
    password: senhaAleatoria,
    email_confirm: true,
  });

  if (erroCreate) {
    if (erroCreate.message?.toLowerCase().includes("already")) {
      const { data: usuarioExistente } = await admin
        .from("Usuarios")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (usuarioExistente) {
        await admin.from("agent_sessions").upsert(
          {
            whatsapp_number,
            usuario_id: usuarioExistente.id,
            onboarding_etapa: "concluido",
            link_confirmacao_pendente: true,
          },
          { onConflict: "whatsapp_number" }
        );
        await enviarLinkMagico(email);
      }

      return Response.json({ success: false, error_code: "EMAIL_JA_CADASTRADO" }, { status: 200 });
    }

    return Response.json({ success: false, error_code: "ERRO_CRIAR_CONTA" }, { status: 200 });
  }

  const contatoDigitos = Number(String(whatsapp_number).replace(/\D/g, ""));

  const { data: novoUsuario, error: erroUsuarios } = await admin
    .from("Usuarios")
    .insert({
      id_user: criado.user.id,
      nome,
      email,
      contato: contatoDigitos,
      crp: null,
      role: "psicologo",
      aprovado: false,
      whatsapp_number,
      whatsapp_verified: false,
    })
    .select("id")
    .single();

  if (erroUsuarios) {
    return Response.json({ success: false, error_code: "ERRO_CRIAR_CONTA" }, { status: 200 });
  }

  await criarClassificacoesPadrao(admin, criado.user.id).catch(() => {});

  await admin.from("agent_sessions").upsert(
    {
      whatsapp_number,
      usuario_id: novoUsuario.id,
      onboarding_etapa: "aguardando_confirmacao_email",
      link_confirmacao_pendente: true,
    },
    { onConflict: "whatsapp_number" }
  );

  await enviarLinkMagico(email);

  return Response.json({ success: true });
}

async function reenviarOuRevalidar(admin, { whatsapp_number }) {
  const { data: sessao } = await admin
    .from("agent_sessions")
    .select("usuario_id")
    .eq("whatsapp_number", whatsapp_number)
    .maybeSingle();

  if (!sessao?.usuario_id) {
    return Response.json({ success: false, error_code: "WHATSAPP_NAO_VINCULADO" }, { status: 200 });
  }

  const { data: usuario } = await admin
    .from("Usuarios")
    .select("email")
    .eq("id", sessao.usuario_id)
    .maybeSingle();

  if (!usuario?.email) {
    return Response.json({ success: false, error_code: "WHATSAPP_NAO_VINCULADO" }, { status: 200 });
  }

  await admin.from("agent_sessions").update({ link_confirmacao_pendente: true }).eq("whatsapp_number", whatsapp_number);
  await enviarLinkMagico(usuario.email);

  return Response.json({ success: true });
}

export async function POST(request) {
  const segredo = request.headers.get("x-agent-secret");
  if (!segredo || segredo !== process.env.AGENT_TOOL_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { acao, whatsapp_number } = body;

  if (!whatsapp_number) {
    return Response.json({ success: false, error_code: "WHATSAPP_NUMBER_AUSENTE" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (acao === "criar_conta") {
    return criarConta(admin, body);
  }

  if (acao === "reenviar_link" || acao === "revalidar") {
    return reenviarOuRevalidar(admin, body);
  }

  return Response.json({ success: false, error_code: "ACAO_DESCONHECIDA" }, { status: 400 });
}
```

- [ ] **Step 2: Build local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 3: Subir `next start` local e testar via `curl` — cadastro novo**

Em um terminal, defina `AGENT_TOOL_SECRET` (só nesta sessão de shell, nunca em `.env.local`) e suba o servidor buildado:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && AGENT_TOOL_SECRET=teste-local-secreto npm run start
```

Em outro terminal:

```bash
curl -s -X POST http://localhost:3000/api/agent/onboarding \
  -H "x-agent-secret: teste-local-secreto" -H "Content-Type: application/json" \
  -d '{"acao":"criar_conta","whatsapp_number":"5511900000010","nome":"Teste Rota","email":"teste-rota-onboarding@example.com"}'
```

Expected: `{"success":true}`. Confirme por script (mesmo padrão das tasks anteriores) que `Usuarios` ganhou a linha nova (`aprovado=false`, `whatsapp_verified=false`) e `agent_sessions` tem `onboarding_etapa='aguardando_confirmacao_email'`, `link_confirmacao_pendente=true`, `tentativas_cadastro=1`. Repita a chamada 3 vezes seguidas com o mesmo número — a 4ª deve responder `{"success":false,"error_code":"LIMITE_TENTATIVAS_CADASTRO"}`. Repita de novo com o e-mail já usado (`teste-rota-onboarding@example.com`) e um número diferente — deve responder `EMAIL_JA_CADASTRADO`. Limpe os dados de teste (`Usuarios`, `agent_sessions`, o Auth user via `admin.auth.admin.deleteUser`) via script ao final.

- [ ] **Step 4: Commit**

```bash
git add web/app/api/agent/onboarding/route.js && git commit -m "feat(whatsapp-agent): adiciona rota /api/agent/onboarding (criar conta, reenviar link, revalidar)"
```

---

## Task 7: `/api/agent/call-tool` — allowlist + isenção de plano no onboarding

**Files:**
- Modify: `web/app/api/agent/call-tool/route.js`

**Interfaces:**
- Consumes: `agent_criar_consultorio`/`agent_criar_paciente`/`agent_criar_conta_bancaria` (Tasks 2-4), coluna `agent_sessions.onboarding_etapa` (Task 1).
- Produces: as 3 tools novas passam a ser chamáveis pela rota já em produção, isentas da checagem `PLANOS[...].temWhatsapp` enquanto `onboarding_etapa <> 'concluido'`.

- [ ] **Step 1: Adicionar as 3 tools à allowlist e à lista de isenção de plano**

```js
// web/app/api/agent/call-tool/route.js
const TOOLS_VALIDAS = [
  "agent_buscar_paciente",
  "agent_get_agenda",
  "agent_status_pagamento_paciente",
  "agent_listar_debitos_paciente",
  "agent_registrar_pagamento_sessao",
  "agent_marcar_atendimento_realizado",
  "agent_agendar_sessao_avulsa",
  "agent_cancelar_sessao",
  "agent_gerar_recibo",
  "agent_listar_inadimplentes",
  "agent_resumo_financeiro",
  "agent_reagendar_sessao",
  "agent_excluir_sessao",
  "agent_excluir_pagamento",
  "agent_registrar_lancamento_despesa",
  "agent_registrar_anamnese",
  "agent_criar_consultorio",
  "agent_criar_paciente",
  "agent_criar_conta_bancaria",
];

// Tools do onboarding guiado: ignoram a checagem de plano enquanto o
// onboarding nao terminou (decisao do usuario, 2026-09-04 -- ver spec
// docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md,
// secao "Tools novas"). Depois de onboarding_etapa = 'concluido', voltam a
// exigir plano pago como as demais tools.
const TOOLS_ONBOARDING = ["agent_criar_consultorio", "agent_criar_paciente", "agent_criar_conta_bancaria"];
```

- [ ] **Step 2: Ajustar a checagem de plano**

Localize o bloco atual (depois de resolver `profissional` via `whatsapp_number`/`whatsapp_verified`):

```js
  if (!profissional || !PLANOS[profissional.plano]?.temWhatsapp) {
    return Response.json({ success: false, error_code: "PLANO_SEM_WHATSAPP" }, { status: 200 });
  }
```

Substitua por:

```js
  if (!profissional) {
    return Response.json({ success: false, error_code: "PLANO_SEM_WHATSAPP" }, { status: 200 });
  }

  const isToolOnboarding = TOOLS_ONBOARDING.includes(tool_name);
  let onboardingConcluido = true;

  if (isToolOnboarding) {
    const { data: sessaoOnboarding } = await admin
      .from("agent_sessions")
      .select("onboarding_etapa")
      .eq("whatsapp_number", whatsapp_number)
      .maybeSingle();
    onboardingConcluido = sessaoOnboarding?.onboarding_etapa === "concluido" || !sessaoOnboarding?.onboarding_etapa;
  }

  const exigePlano = !isToolOnboarding || onboardingConcluido;

  if (exigePlano && !PLANOS[profissional.plano]?.temWhatsapp) {
    return Response.json({ success: false, error_code: "PLANO_SEM_WHATSAPP" }, { status: 200 });
  }
```

Nota: `onboardingConcluido` trata `onboarding_etapa` nulo/ausente (nenhuma linha em `agent_sessions`, ou linha sem onboarding nunca iniciado — caso de contas antigas, criadas antes desta entrega) como "concluído" — ou seja, exige plano como hoje. Só quem está **ativamente** em `aguardando_confirmacao_email`/`consultorio`/`paciente`/`conta` ganha a isenção.

- [ ] **Step 3: Build local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 4: Testar isenção de plano via `curl` contra `next start` local**

Reaproveitando o profissional de teste criado no Step 3 da Task 6 (ou criando um novo com `plano='gratis'` explícito e `onboarding_etapa='consultorio'` em `agent_sessions`):

```bash
curl -s -X POST http://localhost:3000/api/agent/call-tool \
  -H "x-agent-secret: teste-local-secreto" -H "Content-Type: application/json" \
  -d '{"tool_name":"agent_criar_consultorio","whatsapp_number":"5511900000010","params":{"p_nome":"Consultório via call-tool"}}'
```

Expected: `{"success":true,"data":<id>}` mesmo com `plano='gratis'` (porque `onboarding_etapa` não é `'concluido'`). Depois, atualize manualmente `agent_sessions.onboarding_etapa` desse número pra `'concluido'` via script e repita a mesma chamada — agora espera `{"success":false,"error_code":"PLANO_SEM_WHATSAPP"}`. Limpe os dados de teste ao final.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/agent/call-tool/route.js && git commit -m "feat(whatsapp-agent): isenta tools de onboarding da checagem de plano"
```

---

## Task 8: Retomada do onboarding em `/auth/callback` e `/auth/confirm`

**Files:**
- Create: `web/lib/whatsapp-onboarding-callback.js`
- Modify: `web/app/auth/callback/route.js`
- Modify: `web/app/auth/confirm/route.js`

**Interfaces:**
- Consumes: `createAdminClient`, coluna `agent_sessions.link_confirmacao_pendente` (Task 1).
- Produces: `continuarFluxoWhatsapp(userIdAuth: string): Promise<void>` — nunca lança erro (fire-and-forget, loga e segue). Chamada por ambos os handlers de callback depois de estabelecer a sessão com sucesso. Consumida pelo plano de n8n futuro (que expõe `N8N_ONBOARDING_CONTINUE_URL`).

- [ ] **Step 1: Criar o helper compartilhado**

Duplicado propositalmente em dois pontos de entrada porque o link mágico do Supabase pode cair em `/auth/callback` (fluxo `?code=`, o mesmo já usado por convite/OAuth neste projeto) ou em `/auth/confirm` (fluxo `?token_hash=&type=`) dependendo de detalhes internos do GoTrue que não são garantidos por fora — chamar o mesmo helper dos dois lugares evita ter que apostar em qual vai ser usado.

```js
// web/lib/whatsapp-onboarding-callback.js
import { createAdminClient } from "@/lib/supabase/admin";

// Chamada depois que /auth/callback ou /auth/confirm confirmam a sessao
// com sucesso. Se esse login nao tiver nada a ver com o fluxo de
// onboarding/revalidacao via WhatsApp (ex: login normal, convite,
// recuperacao de senha), nao encontra nenhuma linha pendente e nao faz
// nada. Nunca lanca erro -- uma falha aqui nao pode impedir o usuario de
// entrar no app.
export async function continuarFluxoWhatsapp(userIdAuth) {
  if (!userIdAuth) return;

  try {
    const admin = createAdminClient();

    const { data: usuario } = await admin.from("Usuarios").select("id").eq("id_user", userIdAuth).maybeSingle();
    if (!usuario) return;

    const { data: sessao } = await admin
      .from("agent_sessions")
      .select("whatsapp_number")
      .eq("usuario_id", usuario.id)
      .eq("link_confirmacao_pendente", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sessao) return;

    const webhookUrl = process.env.N8N_ONBOARDING_CONTINUE_URL;
    const secret = process.env.N8N_ONBOARDING_SECRET;
    if (!webhookUrl || !secret) {
      console.error("N8N_ONBOARDING_CONTINUE_URL/N8N_ONBOARDING_SECRET ausentes -- onboarding via WhatsApp não pôde ser retomado.");
      return;
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-onboarding-secret": secret },
      body: JSON.stringify({ whatsapp_number: sessao.whatsapp_number }),
    });
  } catch (erro) {
    console.error("Falha ao retomar onboarding via WhatsApp:", erro.message);
  }
}
```

- [ ] **Step 2: Wire em `/auth/callback`**

```js
// web/app/auth/callback/route.js
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { continuarFluxoWhatsapp } from "@/lib/whatsapp-onboarding-callback";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await continuarFluxoWhatsapp(data?.user?.id ?? data?.session?.user?.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
```

- [ ] **Step 3: Wire em `/auth/confirm`**

```js
// web/app/auth/confirm/route.js
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { continuarFluxoWhatsapp } from "@/lib/whatsapp-onboarding-callback";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      await continuarFluxoWhatsapp(data?.user?.id ?? data?.session?.user?.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
```

- [ ] **Step 4: Build local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 5: Testar o helper isoladamente (sem depender do webhook do n8n, que só existe no plano seguinte)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
const numero = '5511900000011';

(async () => {
  const { data: authUser } = await admin.auth.admin.createUser({ email: 'teste-callback-onboarding@example.com', password: 'senha-teste-descartavel-123', email_confirm: true });
  const { data: usuario } = await admin.from('Usuarios').insert({
    id_user: authUser.user.id, nome: 'Teste Callback', email: 'teste-callback-onboarding@example.com',
    contato: 5511999990003, role: 'psicologo', aprovado: false, whatsapp_number: numero, whatsapp_verified: false,
  }).select('id').single();
  await admin.from('agent_sessions').upsert({ whatsapp_number: numero, usuario_id: usuario.id, onboarding_etapa: 'aguardando_confirmacao_email', link_confirmacao_pendente: true }, { onConflict: 'whatsapp_number' });

  // Simula a query que continuarFluxoWhatsapp faz, sem precisar de um code/token_hash real:
  const { data: sessaoEncontrada } = await admin
    .from('agent_sessions')
    .select('whatsapp_number')
    .eq('usuario_id', usuario.id)
    .eq('link_confirmacao_pendente', true)
    .maybeSingle();
  console.log('sessao pendente encontrada pelo helper (esperado o numero de teste):', sessaoEncontrada);

  await admin.from('agent_sessions').delete().eq('whatsapp_number', numero);
  await admin.from('Usuarios').delete().eq('id', usuario.id);
  await admin.auth.admin.deleteUser(authUser.user.id);
  console.log('dados de teste limpos');
})();
"
```

Expected: a query encontra a linha pendente pelo `usuario_id`, confirmando que a lógica de busca do helper está correta. (O teste ponta a ponta real — clicar um link mágico de verdade e ver o `fetch` sair — só é possível depois que `N8N_ONBOARDING_CONTINUE_URL` existir, no plano seguinte; até lá, `continuarFluxoWhatsapp` loga o erro de env var ausente e segue sem quebrar o login, comportamento intencional já coberto pelo `try/catch`.)

- [ ] **Step 6: Commit**

```bash
git add web/lib/whatsapp-onboarding-callback.js web/app/auth/callback/route.js web/app/auth/confirm/route.js && git commit -m "feat(whatsapp-agent): retoma onboarding via WhatsApp apos clique no link magico"
```

---

## Task 9: Documentação — `docs/status-implementacao.md`

**Files:**
- Modify: `docs/status-implementacao.md`

**Interfaces:**
- Nenhuma (documentação).

- [ ] **Step 1: Adicionar uma seção nova no topo do arquivo, mesmo formato das entregas anteriores**

```markdown
## Início de operação via WhatsApp — backend (2026-09-04)

Implementado o backend do plano `docs/superpowers/plans/2026-09-04-inicio-operacao-whatsapp-backend.md`
(spec `docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md`):
6 colunas novas em `agent_sessions` (estado de onboarding, validação de
segurança, anti-abuso), 3 RPCs novas do agente
(`agent_criar_consultorio`, `agent_criar_paciente`,
`agent_criar_conta_bancaria`), rota `POST /api/agent/onboarding`
(criação de conta com senha aleatória + link mágico, reenvio,
revalidação), isenção de plano nas 3 tools novas enquanto o onboarding
não termina, e retomada do fluxo em `/auth/callback`/`/auth/confirm`.

- **Env vars novas `N8N_ONBOARDING_SECRET`/`N8N_ONBOARDING_CONTINUE_URL`**
  — autenticam a chamada de saída do Next.js pro webhook do n8n que
  retoma o onboarding depois do clique no link mágico. **Ainda não
  configuradas em nenhum ambiente** — o workflow n8n que as consome
  (`WA - Onboarding`) é o próximo plano, ainda não construído. Até lá,
  `continuarFluxoWhatsapp` (`web/lib/whatsapp-onboarding-callback.js`)
  loga o erro e segue sem bloquear login — comportamento intencional.
- **`AGENT_TOOL_SECRET` reaproveitado** pra `/api/agent/onboarding` —
  mesma direção de chamada (n8n → Next.js) de `/api/agent/call-tool`,
  não precisa de segredo próprio.
- **Ainda não implantado em produção** — commitado na `main`, aguardando
  o plano do workflow n8n (que efetivamente aciona esse backend) antes
  de fazer sentido implantar sozinho.
- **Falta pra fechar a entrega**: plano do workflow n8n (`WA -
  Onboarding` + extensões do Router/Agent Psicólogo), documentado como
  próximo passo na spec.
```

- [ ] **Step 2: Commit**

```bash
git add docs/status-implementacao.md && git commit -m "docs: registra backend do início de operação via WhatsApp"
```

---

## Self-Review

**Cobertura da spec**: cadastro novo (Task 6), diferenciação "e-mail já cadastrado" (Task 6), revalidação/reenvio (Task 6), retomada via `/auth/callback`/`/auth/confirm` (Task 8), 3 tools de onboarding guiado (Tasks 2-4), isenção de plano durante onboarding (Task 7), colunas de estado (`agent_sessions`, Task 1), limite anti-abuso (Task 6). Fora deste plano por decisão explícita (decomposição em sub-planos, mesma convenção já usada pelo item 13 original): workflow n8n (`WA - Onboarding`, extensões do Router/Agent) — não é uma lacuna, é a Fase 2 documentada no cabeçalho.

**Placeholder scan**: nenhum "TBD"/"implementar depois" — todo step tem código completo. `ONBOARDING_ETAPA_INVALIDA` (catalogado na spec) foi conscientemente não implementado, com justificativa explícita no Global Constraints (YAGNI, redundante com a checagem de plano), não deixado como lacuna silenciosa.

**Consistência de tipos/assinaturas**: `continuarFluxoWhatsapp(userIdAuth)` — mesmo nome/assinatura usado nas Tasks 8.2/8.3. `TOOLS_ONBOARDING` (Task 7) usa exatamente os 3 nomes de função definidos nas Tasks 2-4. `link_confirmacao_pendente`/`onboarding_etapa`/`tentativas_cadastro*` (Task 1) são os mesmos nomes de coluna usados em todas as queries das Tasks 6-8.
