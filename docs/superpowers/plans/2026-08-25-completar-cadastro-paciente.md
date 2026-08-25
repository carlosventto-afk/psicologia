# Link público pro paciente completar o próprio cadastro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O profissional gera, de dentro da ficha do paciente, um link público de uso único (7 dias) que o paciente abre sem login pra atualizar telefone/e-mail/endereço/CPF/RG. O envio vira uma proposta pendente — nunca sobrescreve `Paciente` direto — que o profissional revisa campo a campo e aceita (com opção de desmarcar algum campo) ou rejeita (podendo ainda aceitar "mesmo assim" até 60 dias depois de rejeitar).

**Architecture:** Duas tabelas novas (`TokenCompletarCadastro`, `PropostaCompletarCadastro`) e 5 RPCs `security definer` que mediam todo o acesso — nenhuma das duas tabelas tem policy de escrita, e `TokenCompletarCadastro` não tem policy nenhuma (leitura só via RPC). Uma rota pública nova (`/completar-cadastro/[token]`, fora do grupo `(app)`) usa 2 dessas RPCs (`anon`); o lado do profissional (dentro do grupo `(app)`) usa as outras 3 (`authenticated`, com checagem de `Paciente.owner = auth.uid()` embutida em cada RPC).

**Tech Stack:** Next.js 16 App Router (Server Components/Actions), Supabase Postgres (RPCs `plpgsql security definer`). Sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc com `pg`/`@supabase/supabase-js`, e verificação final no navegador via Playwright CLI contra build+preview.

**Spec:** `docs/superpowers/specs/2026-08-25-completar-cadastro-paciente-design.md`

## Global Constraints

- Campos editáveis pelo paciente: `telefone`, `email`, `endereco`, `cpf`, `rg_numero`, `rg_data_expedicao`, `rg_orgao_emissor` — os mesmos nomes de coluna já usados em `Paciente`. Anamnese fica de fora.
- Token: 7 dias de validade, uso único. Gerar um link novo invalida (expira) qualquer link anterior ainda ativo do mesmo paciente.
- Proposta `pendente`: sem prazo de ação. Proposta `rejeitada`: só pode ser aceita "mesmo assim" até `criado_em + 60 dias` — depois disso fica só como histórico.
- Aceitar é sempre "tudo, com opção de desmarcar campo a campo" — nunca campo a campo como fluxos independentes.
- Nenhuma das duas tabelas novas tem policy de escrita para `anon`/`authenticated` — toda escrita passa pelas 5 RPCs `security definer`, seguindo exatamente o padrão de `supabase/migrations/20260730000001_whatsapp_agent_onboarding.sql` (`gerar_codigo_verificacao_whatsapp`/`validar_codigo_whatsapp`).
- Conexão direta ao Postgres de produção pra aplicar migrations: `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.rohulajgyxdangxfurha.supabase.co:5432/postgres` (`SUPABASE_DB_PASSWORD` já está no ambiente). `web/.env.local` tem `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` pros scripts que usam `@supabase/supabase-js`.
- Qualquer usuário/paciente/token/proposta criado por script de verificação é descartável e deve ser apagado ao final do próprio script (mesmo padrão de planos anteriores, ex. `docs/superpowers/plans/2026-08-14-nfse-emissao.md`).
- Build + preview local, nunca `npm run dev`, pra qualquer teste no navegador. Playwright via CLI (`npx playwright`), nunca MCP.
- `pgcrypto` já está habilitada neste banco (`supabase/migrations/20260727000001_add_whatsapp_agent.sql`) — `gen_random_bytes` funciona sem nova extensão, mas a migration da Task 2 inclui `create extension if not exists pgcrypto;` de forma defensiva/idempotente, mesmo padrão já usado no projeto.

---

## Task 1: Migration — tabelas `TokenCompletarCadastro` e `PropostaCompletarCadastro` + RLS

**Files:**
- Create: `supabase/migrations/20260825000002_add_completar_cadastro_tabelas.sql`

**Interfaces:**
- Produces: tabela `TokenCompletarCadastro` (`id uuid`, `paciente_id`, `token` único, `criado_em`, `expira_em`, `usado_em`) sem nenhuma policy de RLS (só RPC acessa); tabela `PropostaCompletarCadastro` (`id uuid`, `paciente_id`, `token_id`, `status`, os 7 campos `_pendente`, `criado_em`, `decidido_em`) com policy de leitura só pro profissional dono. Consumidas pelas RPCs da Task 2.

- [ ] **Step 1: Escrever a migration**

```sql
-- Link publico pro paciente completar o proprio cadastro (backlog item 14):
-- profissional gera um token de uso unico (7 dias de validade), manda pro
-- paciente por fora do app; paciente abre sem login e envia telefone/email/
-- endereco/cpf/rg, que vira uma PROPOSTA pendente -- nunca sobrescreve
-- Paciente direto. Profissional revisa e aceita (por campo, com opcao de
-- desmarcar algum) ou rejeita. Toda leitura/escrita passa pelas RPCs da
-- migration seguinte (security definer), nao por policy de RLS direta.
create table "TokenCompletarCadastro" (
  id uuid primary key default gen_random_uuid(),
  paciente_id bigint not null references "Paciente"(id) on delete cascade,
  token text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz
);

create index tokencompletarcadastro_paciente_idx on "TokenCompletarCadastro"(paciente_id);

-- rejeitada pode ainda ser aceita ("profissional muda de ideia") ate 60
-- dias da criacao; pendente fica sem prazo, esperando o profissional agir.
create table "PropostaCompletarCadastro" (
  id uuid primary key default gen_random_uuid(),
  paciente_id bigint not null references "Paciente"(id) on delete cascade,
  token_id uuid not null references "TokenCompletarCadastro"(id),
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'rejeitada')),
  telefone_pendente text,
  email_pendente text,
  endereco_pendente text,
  cpf_pendente text,
  rg_numero_pendente text,
  rg_data_expedicao_pendente date,
  rg_orgao_emissor_pendente text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);

create index propostacompletarcadastro_paciente_idx on "PropostaCompletarCadastro"(paciente_id);

alter table "TokenCompletarCadastro" enable row level security;
alter table "PropostaCompletarCadastro" enable row level security;

-- TokenCompletarCadastro: nenhuma policy -- nem anon nem authenticated leem
-- ou escrevem a tabela direto, so as RPCs (security definer) da proxima
-- migration acessam.

-- PropostaCompletarCadastro: so leitura pro profissional dono do paciente,
-- mesmo padrao em join ja usado por Anamnese/AnamneseFollowup. Escrita so
-- pelas RPCs.
create policy "propostacompletarcadastro_select_dono" on "PropostaCompletarCadastro"
  for select using (
    exists (
      select 1 from "Paciente" p
      where p.id = "PropostaCompletarCadastro".paciente_id
        and (p.owner = auth.uid() or public.is_admin())
    )
  );
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260825000002_add_completar_cadastro_tabelas.sql', 'utf8');
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

- [ ] **Step 3: Verificar colunas e policies**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select table_name, column_name, data_type, is_nullable from information_schema.columns where table_name in ('TokenCompletarCadastro', 'PropostaCompletarCadastro') order by table_name, ordinal_position\");
  console.table(cols.rows);
  const policies = await client.query(\"select tablename, policyname from pg_policies where tablename in ('TokenCompletarCadastro', 'PropostaCompletarCadastro')\");
  console.table(policies.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `TokenCompletarCadastro` com 6 colunas (`id`, `paciente_id`, `token`, `criado_em`, `expira_em`, `usado_em`); `PropostaCompletarCadastro` com 12 colunas; **zero** linhas na tabela de policies pra `TokenCompletarCadastro`; **uma** linha (`propostacompletarcadastro_select_dono`) pra `PropostaCompletarCadastro`.

- [ ] **Step 4: Testar RLS (anon bloqueado, dono lê Proposta mas não Token) e cascade**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-completar-cadastro-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste Completar Cadastro', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });
  const { data: consultorio } = await admin.from('Consultorio').insert({ nome: 'C Teste', owner: idUser }).select('id').single();
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Paciente Teste', consultorio: consultorio.id, valor_sessao: 100, owner: idUser }).select('id').single();

  const { data: token } = await admin.from('TokenCompletarCadastro').insert({ paciente_id: paciente.id, token: 'tok-teste-123', expira_em: new Date(Date.now() + 7*24*3600*1000).toISOString() }).select('id').single();
  const { data: proposta } = await admin.from('PropostaCompletarCadastro').insert({ paciente_id: paciente.id, token_id: token.id, telefone_pendente: '11988887777' }).select('id').single();

  const anon = createClient(url, anonKey);
  const anonToken = await anon.from('TokenCompletarCadastro').select('id').eq('id', token.id);
  const anonProposta = await anon.from('PropostaCompletarCadastro').select('id').eq('id', proposta.id);
  console.log('anon le TokenCompletarCadastro (esperado 0 linhas, sem erro):', anonToken.data?.length, anonToken.error?.message || '');
  console.log('anon le PropostaCompletarCadastro (esperado 0 linhas, sem erro):', anonProposta.data?.length, anonProposta.error?.message || '');

  const asOwner = createClient(url, anonKey);
  await asOwner.auth.signInWithPassword({ email, password: 'SenhaTeste123' });
  const ownerToken = await asOwner.from('TokenCompletarCadastro').select('id').eq('id', token.id);
  const ownerProposta = await asOwner.from('PropostaCompletarCadastro').select('id').eq('id', proposta.id);
  console.log('dono le TokenCompletarCadastro direto (esperado 0 linhas -- so via RPC):', ownerToken.data?.length, ownerToken.error?.message || '');
  console.log('dono le PropostaCompletarCadastro direto (esperado 1 linha):', ownerProposta.data?.length, ownerProposta.error?.message || '');

  await admin.from('Paciente').delete().eq('id', paciente.id);
  const restouToken = await admin.from('TokenCompletarCadastro').select('id').eq('id', token.id);
  const restouProposta = await admin.from('PropostaCompletarCadastro').select('id').eq('id', proposta.id);
  console.log('cascade apos apagar paciente -- token restante (esperado 0):', restouToken.data?.length);
  console.log('cascade apos apagar paciente -- proposta restante (esperado 0):', restouProposta.data?.length);

  await admin.from('Consultorio').delete().eq('id', consultorio.id);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup concluido');
})();
"
```

Expected: `anon` sempre 0 linhas nas duas tabelas; dono autenticado 0 linhas em `TokenCompletarCadastro` (bloqueado, só RPC acessa) e 1 linha em `PropostaCompletarCadastro`; cascade ao apagar `Paciente` zera as duas tabelas; cleanup concluído sem erro.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260825000002_add_completar_cadastro_tabelas.sql && git commit -m "feat: adiciona tabelas TokenCompletarCadastro e PropostaCompletarCadastro com RLS"
```

---

## Task 2: Migration — 5 RPCs `security definer` + grants

**Files:**
- Create: `supabase/migrations/20260825000003_add_completar_cadastro_rpcs.sql`

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces: `gerar_link_completar_cadastro(p_paciente_id bigint) returns text` (grant `authenticated`); `buscar_dados_completar_cadastro(p_token text) returns jsonb` (grant `anon`); `enviar_proposta_completar_cadastro(p_token text, p_telefone text, p_email text, p_endereco text, p_cpf text, p_rg_numero text, p_rg_data_expedicao date, p_rg_orgao_emissor text) returns void` (grant `anon`); `aceitar_proposta_completar_cadastro(p_proposta_id uuid, p_campos_aceitos text[]) returns void` (grant `authenticated`); `rejeitar_proposta_completar_cadastro(p_proposta_id uuid) returns void` (grant `authenticated`). Consumidas pelas Tasks 4/5.

- [ ] **Step 1: Escrever a migration**

```sql
-- RPCs do link publico de completar cadastro (backlog item 14). Todas
-- security definer, seguindo o mesmo padrao de
-- supabase/migrations/20260730000001_whatsapp_agent_onboarding.sql: uma
-- chamada pelo profissional autenticado (authenticated), duas chamadas
-- pelo paciente sem sessao (anon).
create extension if not exists pgcrypto;

create or replace function public.gerar_link_completar_cadastro(p_paciente_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from "Paciente" p
    where p.id = p_paciente_id and (p.owner = auth.uid() or public.is_admin())
  ) then
    raise exception 'PACIENTE_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  -- invalida qualquer link anterior ainda ativo do mesmo paciente -- so o
  -- mais recente funciona.
  update "TokenCompletarCadastro"
  set expira_em = now()
  where paciente_id = p_paciente_id
    and usado_em is null
    and expira_em > now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into "TokenCompletarCadastro" (paciente_id, token, expira_em)
  values (p_paciente_id, v_token, now() + interval '7 days');

  return v_token;
end;
$$;

create or replace function public.buscar_dados_completar_cadastro(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token "TokenCompletarCadastro"%rowtype;
  v_paciente "Paciente"%rowtype;
begin
  select * into v_token
  from "TokenCompletarCadastro"
  where token = p_token and usado_em is null and expira_em > now();

  if v_token.id is null then
    raise exception 'TOKEN_INVALIDO' using errcode = 'P0001';
  end if;

  select * into v_paciente from "Paciente" where id = v_token.paciente_id;

  return jsonb_build_object(
    'nome', v_paciente.nome,
    'telefone', v_paciente.telefone,
    'email', v_paciente.email,
    'endereco', v_paciente.endereco,
    'cpf', v_paciente.cpf,
    'rg_numero', v_paciente.rg_numero,
    'rg_data_expedicao', v_paciente.rg_data_expedicao,
    'rg_orgao_emissor', v_paciente.rg_orgao_emissor
  );
end;
$$;

create or replace function public.enviar_proposta_completar_cadastro(
  p_token text,
  p_telefone text,
  p_email text,
  p_endereco text,
  p_cpf text,
  p_rg_numero text,
  p_rg_data_expedicao date,
  p_rg_orgao_emissor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token "TokenCompletarCadastro"%rowtype;
begin
  select * into v_token
  from "TokenCompletarCadastro"
  where token = p_token and usado_em is null and expira_em > now();

  if v_token.id is null then
    raise exception 'TOKEN_INVALIDO' using errcode = 'P0001';
  end if;

  update "TokenCompletarCadastro" set usado_em = now() where id = v_token.id;

  insert into "PropostaCompletarCadastro" (
    paciente_id, token_id, telefone_pendente, email_pendente, endereco_pendente,
    cpf_pendente, rg_numero_pendente, rg_data_expedicao_pendente, rg_orgao_emissor_pendente
  ) values (
    v_token.paciente_id, v_token.id, p_telefone, p_email, p_endereco,
    p_cpf, p_rg_numero, p_rg_data_expedicao, p_rg_orgao_emissor
  );
end;
$$;

create or replace function public.aceitar_proposta_completar_cadastro(p_proposta_id uuid, p_campos_aceitos text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta "PropostaCompletarCadastro"%rowtype;
begin
  select pc.* into v_proposta
  from "PropostaCompletarCadastro" pc
  join "Paciente" p on p.id = pc.paciente_id
  where pc.id = p_proposta_id and (p.owner = auth.uid() or public.is_admin());

  if v_proposta.id is null then
    raise exception 'PROPOSTA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_proposta.status = 'aceita' then
    raise exception 'JA_DECIDIDA' using errcode = 'P0001';
  end if;

  if v_proposta.status = 'rejeitada' and now() > v_proposta.criado_em + interval '60 days' then
    raise exception 'PRAZO_EXPIRADO' using errcode = 'P0001';
  end if;

  update "Paciente" set
    telefone = case when 'telefone' = any(p_campos_aceitos) then v_proposta.telefone_pendente else telefone end,
    email = case when 'email' = any(p_campos_aceitos) then v_proposta.email_pendente else email end,
    endereco = case when 'endereco' = any(p_campos_aceitos) then v_proposta.endereco_pendente else endereco end,
    cpf = case when 'cpf' = any(p_campos_aceitos) then v_proposta.cpf_pendente else cpf end,
    rg_numero = case when 'rg_numero' = any(p_campos_aceitos) then v_proposta.rg_numero_pendente else rg_numero end,
    rg_data_expedicao = case when 'rg_data_expedicao' = any(p_campos_aceitos) then v_proposta.rg_data_expedicao_pendente else rg_data_expedicao end,
    rg_orgao_emissor = case when 'rg_orgao_emissor' = any(p_campos_aceitos) then v_proposta.rg_orgao_emissor_pendente else rg_orgao_emissor end
  where id = v_proposta.paciente_id;

  update "PropostaCompletarCadastro" set status = 'aceita', decidido_em = now() where id = p_proposta_id;
end;
$$;

create or replace function public.rejeitar_proposta_completar_cadastro(p_proposta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta "PropostaCompletarCadastro"%rowtype;
begin
  select pc.* into v_proposta
  from "PropostaCompletarCadastro" pc
  join "Paciente" p on p.id = pc.paciente_id
  where pc.id = p_proposta_id and (p.owner = auth.uid() or public.is_admin());

  if v_proposta.id is null then
    raise exception 'PROPOSTA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_proposta.status != 'pendente' then
    raise exception 'JA_DECIDIDA' using errcode = 'P0001';
  end if;

  update "PropostaCompletarCadastro" set status = 'rejeitada', decidido_em = now() where id = p_proposta_id;
end;
$$;

revoke all on function public.gerar_link_completar_cadastro(bigint) from public, anon, authenticated;
grant execute on function public.gerar_link_completar_cadastro(bigint) to authenticated;

revoke all on function public.buscar_dados_completar_cadastro(text) from public, anon, authenticated;
grant execute on function public.buscar_dados_completar_cadastro(text) to anon;

revoke all on function public.enviar_proposta_completar_cadastro(text, text, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.enviar_proposta_completar_cadastro(text, text, text, text, text, text, date, text) to anon;

revoke all on function public.aceitar_proposta_completar_cadastro(uuid, text[]) from public, anon, authenticated;
grant execute on function public.aceitar_proposta_completar_cadastro(uuid, text[]) to authenticated;

revoke all on function public.rejeitar_proposta_completar_cadastro(uuid) from public, anon, authenticated;
grant execute on function public.rejeitar_proposta_completar_cadastro(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260825000003_add_completar_cadastro_rpcs.sql', 'utf8');
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

- [ ] **Step 3: Verificar o fluxo completo das 5 RPCs com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-completar-rpc-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste RPC', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });

  const email2 = 'teste-completar-rpc-2-' + Date.now() + '@example.com';
  const { data: authData2 } = await admin.auth.admin.createUser({ email: email2, password: 'SenhaTeste123', email_confirm: true });
  const idUser2 = authData2.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser2, email: email2, nome: 'Teste RPC 2', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999998' });

  const { data: consultorio } = await admin.from('Consultorio').insert({ nome: 'C Teste RPC', owner: idUser }).select('id').single();
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Paciente RPC', consultorio: consultorio.id, valor_sessao: 100, owner: idUser, telefone: '11900000000', email: 'antigo@example.com' }).select('id').single();

  const asOwner = createClient(url, anonKey);
  await asOwner.auth.signInWithPassword({ email, password: 'SenhaTeste123' });
  const asOutro = createClient(url, anonKey);
  await asOutro.auth.signInWithPassword({ email: email2, password: 'SenhaTeste123' });
  const asAnon = createClient(url, anonKey);

  // 1) dono gera link, outro usuario nao consegue gerar pro paciente de outro
  const { data: token1, error: eGerar1 } = await asOwner.rpc('gerar_link_completar_cadastro', { p_paciente_id: paciente.id });
  console.log('1) dono gera link (esperado token, sem erro):', !!token1, eGerar1?.message || '');
  const { error: eGerarOutro } = await asOutro.rpc('gerar_link_completar_cadastro', { p_paciente_id: paciente.id });
  console.log('1b) outro usuario tenta gerar link (esperado PACIENTE_NAO_ENCONTRADO):', eGerarOutro?.message);

  // 2) gerar 2o link invalida o 1o
  const { data: token2 } = await asOwner.rpc('gerar_link_completar_cadastro', { p_paciente_id: paciente.id });
  const { error: eToken1Invalido } = await asAnon.rpc('buscar_dados_completar_cadastro', { p_token: token1 });
  console.log('2) token1 invalidado pelo token2 (esperado TOKEN_INVALIDO):', eToken1Invalido?.message);
  const { data: dadosToken2, error: eToken2 } = await asAnon.rpc('buscar_dados_completar_cadastro', { p_token: token2 });
  console.log('2b) token2 ainda valido (esperado nome Paciente RPC):', dadosToken2?.nome, eToken2?.message || '');

  // 3) anon envia proposta com token2, reuso do mesmo token falha
  const { error: eEnviar } = await asAnon.rpc('enviar_proposta_completar_cadastro', {
    p_token: token2, p_telefone: '11988887777', p_email: 'novo@example.com', p_endereco: 'Rua Nova, 123',
    p_cpf: null, p_rg_numero: null, p_rg_data_expedicao: null, p_rg_orgao_emissor: null,
  });
  console.log('3) enviar proposta (esperado sem erro):', eEnviar?.message || 'ok');
  const { error: eReuso } = await asAnon.rpc('enviar_proposta_completar_cadastro', {
    p_token: token2, p_telefone: 'x', p_email: null, p_endereco: null, p_cpf: null, p_rg_numero: null, p_rg_data_expedicao: null, p_rg_orgao_emissor: null,
  });
  console.log('3b) reusar token2 (esperado TOKEN_INVALIDO):', eReuso?.message);

  const { data: proposta } = await admin.from('PropostaCompletarCadastro').select('id, status').eq('paciente_id', paciente.id).single();
  console.log('proposta criada com status (esperado pendente):', proposta.status);

  // 4) outro usuario nao consegue rejeitar/aceitar proposta de paciente alheio
  const { error: eRejeitarOutro } = await asOutro.rpc('rejeitar_proposta_completar_cadastro', { p_proposta_id: proposta.id });
  console.log('4) outro usuario tenta rejeitar (esperado PROPOSTA_NAO_ENCONTRADA):', eRejeitarOutro?.message);

  // 5) dono rejeita, depois aceita mesmo assim (dentro do prazo)
  const { error: eRejeitar } = await asOwner.rpc('rejeitar_proposta_completar_cadastro', { p_proposta_id: proposta.id });
  console.log('5) dono rejeita (esperado sem erro):', eRejeitar?.message || 'ok');
  const { error: eRejeitarDeNovo } = await asOwner.rpc('rejeitar_proposta_completar_cadastro', { p_proposta_id: proposta.id });
  console.log('5b) rejeitar de novo (esperado JA_DECIDIDA):', eRejeitarDeNovo?.message);

  const { error: eAceitarParcial } = await asOwner.rpc('aceitar_proposta_completar_cadastro', { p_proposta_id: proposta.id, p_campos_aceitos: ['telefone'] });
  console.log('6) aceitar so telefone apos rejeitar, dentro do prazo (esperado sem erro):', eAceitarParcial?.message || 'ok');

  const { data: pacienteDepois } = await admin.from('Paciente').select('telefone, email, endereco').eq('id', paciente.id).single();
  console.log('7) so telefone mudou (esperado 11988887777 / antigo@example.com / null):', pacienteDepois.telefone, pacienteDepois.email, pacienteDepois.endereco);

  const { error: eAceitarDeNovo } = await asOwner.rpc('aceitar_proposta_completar_cadastro', { p_proposta_id: proposta.id, p_campos_aceitos: ['email'] });
  console.log('8) aceitar proposta ja aceita (esperado JA_DECIDIDA):', eAceitarDeNovo?.message);

  // 9) prazo de 60 dias pra aceitar uma rejeitada
  const { data: token3 } = await asOwner.rpc('gerar_link_completar_cadastro', { p_paciente_id: paciente.id });
  await asAnon.rpc('enviar_proposta_completar_cadastro', { p_token: token3, p_telefone: 'y', p_email: null, p_endereco: null, p_cpf: null, p_rg_numero: null, p_rg_data_expedicao: null, p_rg_orgao_emissor: null });
  const { data: proposta2 } = await admin.from('PropostaCompletarCadastro').select('id').eq('token_id', (await admin.from('TokenCompletarCadastro').select('id').eq('token', token3).single()).data.id).single();
  await asOwner.rpc('rejeitar_proposta_completar_cadastro', { p_proposta_id: proposta2.id });
  await admin.from('PropostaCompletarCadastro').update({ criado_em: new Date(Date.now() - 61*24*3600*1000).toISOString() }).eq('id', proposta2.id);
  const { error: ePrazoExpirado } = await asOwner.rpc('aceitar_proposta_completar_cadastro', { p_proposta_id: proposta2.id, p_campos_aceitos: ['telefone'] });
  console.log('9) aceitar rejeitada com 61 dias (esperado PRAZO_EXPIRADO):', ePrazoExpirado?.message);

  // cleanup
  await admin.from('PropostaCompletarCadastro').delete().eq('paciente_id', paciente.id);
  await admin.from('TokenCompletarCadastro').delete().eq('paciente_id', paciente.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  await admin.from('Consultorio').delete().eq('id', consultorio.id);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.from('Usuarios').delete().eq('id_user', idUser2);
  await admin.auth.admin.deleteUser(idUser);
  await admin.auth.admin.deleteUser(idUser2);
  console.log('cleanup concluido');
})();
"
```

Expected (na ordem): 1) token gerado sem erro; 1b) `PACIENTE_NAO_ENCONTRADO`; 2) `TOKEN_INVALIDO` pro token1; 2b) nome `Paciente RPC` pro token2; 3) proposta enviada sem erro; 3b) `TOKEN_INVALIDO` ao reusar; status `pendente`; 4) `PROPOSTA_NAO_ENCONTRADA`; 5) rejeitado sem erro; 5b) `JA_DECIDIDA`; 6) aceito sem erro; 7) só `telefone` mudou (`email`/`endereco` continuam os valores antigos); 8) `JA_DECIDIDA`; 9) `PRAZO_EXPIRADO`; cleanup concluído sem erro.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260825000003_add_completar_cadastro_rpcs.sql && git commit -m "feat: adiciona RPCs de link publico para completar cadastro do paciente"
```

---

## Task 3: Lista compartilhada dos campos editáveis

**Files:**
- Create: `web/lib/completar-cadastro-campos.js`

**Interfaces:**
- Produces: `CAMPOS_COMPLETAR_CADASTRO` — array de `{ chave: string, rotulo: string, tipo: string }` (`tipo` é o `type` do `<input>` HTML), na ordem de exibição. Consumida pelas Tasks 6 e 8.

- [ ] **Step 1: Criar o arquivo**

```js
export const CAMPOS_COMPLETAR_CADASTRO = [
  { chave: "telefone", rotulo: "Telefone", tipo: "text" },
  { chave: "email", rotulo: "E-mail", tipo: "email" },
  { chave: "endereco", rotulo: "Endereço", tipo: "text" },
  { chave: "cpf", rotulo: "CPF", tipo: "text" },
  { chave: "rg_numero", rotulo: "Número do RG", tipo: "text" },
  { chave: "rg_data_expedicao", rotulo: "Data de expedição do RG", tipo: "date" },
  { chave: "rg_orgao_emissor", rotulo: "Órgão emissor do RG", tipo: "text" },
];
```

- [ ] **Step 2: Verificar que o arquivo exporta o array esperado**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
import('./lib/completar-cadastro-campos.js').then(({ CAMPOS_COMPLETAR_CADASTRO }) => {
  console.log('quantidade de campos (esperado 7):', CAMPOS_COMPLETAR_CADASTRO.length);
  console.log('chaves:', CAMPOS_COMPLETAR_CADASTRO.map((c) => c.chave).join(', '));
});
"
```

Expected: `7`, seguido de `telefone, email, endereco, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor`.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/completar-cadastro-campos.js && git commit -m "feat: adiciona lista compartilhada dos campos de completar cadastro"
```

---

## Task 4: Camada de dados — `web/lib/data/completar-cadastro.js`

**Files:**
- Create: `web/lib/data/completar-cadastro.js`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`.
- Produces:
  - `buscarDadosCompletarCadastro(token)` → objeto `{ nome, telefone, email, endereco, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor }` ou `null` se o token for inválido/expirado/usado.
  - `buscarPropostaAtiva(pacienteId)` → a proposta `pendente` mais recente (prioridade), senão a `rejeitada` mais recente **se ainda dentro dos 60 dias** (nesse caso inclui `prazoAceite`), senão `null`.

- [ ] **Step 1: Escrever `buscarDadosCompletarCadastro`**

```js
import { createClient } from "@/lib/supabase/server";

export async function buscarDadosCompletarCadastro(token) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buscar_dados_completar_cadastro", { p_token: token });

  if (error) return null;
  return data;
}
```

- [ ] **Step 2: Escrever `buscarPropostaAtiva`**

```js
const CAMPOS_SELECT =
  "id, status, telefone_pendente, email_pendente, endereco_pendente, cpf_pendente, rg_numero_pendente, rg_data_expedicao_pendente, rg_orgao_emissor_pendente, criado_em, decidido_em";

export async function buscarPropostaAtiva(pacienteId) {
  const supabase = await createClient();

  const { data: pendente, error: erroPendente } = await supabase
    .from("PropostaCompletarCadastro")
    .select(CAMPOS_SELECT)
    .eq("paciente_id", pacienteId)
    .eq("status", "pendente")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroPendente) throw new Error(erroPendente.message);
  if (pendente) return pendente;

  const { data: rejeitada, error: erroRejeitada } = await supabase
    .from("PropostaCompletarCadastro")
    .select(CAMPOS_SELECT)
    .eq("paciente_id", pacienteId)
    .eq("status", "rejeitada")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroRejeitada) throw new Error(erroRejeitada.message);
  if (!rejeitada) return null;

  const prazo = new Date(rejeitada.criado_em);
  prazo.setDate(prazo.getDate() + 60);
  if (new Date() > prazo) return null;

  return { ...rejeitada, prazoAceite: prazo.toISOString() };
}
```

- [ ] **Step 3: Verificar as duas funções com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-data-cadastro-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste Data', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato: '11999999999' });
  const { data: consultorio } = await admin.from('Consultorio').insert({ nome: 'C Teste Data', owner: idUser }).select('id').single();
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Paciente Data', consultorio: consultorio.id, valor_sessao: 100, owner: idUser }).select('id').single();

  const asOwner = createClient(url, anonKey);
  await asOwner.auth.signInWithPassword({ email, password: 'SenhaTeste123' });
  const asAnon = createClient(url, anonKey);

  const semProposta = await asOwner.from('PropostaCompletarCadastro').select('id').eq('paciente_id', paciente.id);
  console.log('sem proposta ainda (esperado 0):', semProposta.data?.length);

  const { data: token } = await asOwner.rpc('gerar_link_completar_cadastro', { p_paciente_id: paciente.id });
  const dadosToken = await asAnon.rpc('buscar_dados_completar_cadastro', { p_token: token });
  console.log('buscarDadosCompletarCadastro equivalente via RPC (esperado nome Paciente Data):', dadosToken.data?.nome);

  await asAnon.rpc('enviar_proposta_completar_cadastro', { p_token: token, p_telefone: '11977776666', p_email: null, p_endereco: null, p_cpf: null, p_rg_numero: null, p_rg_data_expedicao: null, p_rg_orgao_emissor: null });
  const { data: proposta } = await admin.from('PropostaCompletarCadastro').select('id').eq('paciente_id', paciente.id).single();

  const comPendente = await asOwner.from('PropostaCompletarCadastro').select('id, status').eq('paciente_id', paciente.id).eq('status', 'pendente').maybeSingle();
  console.log('proposta pendente encontrada (esperado status pendente):', comPendente.data?.status);

  await admin.from('PropostaCompletarCadastro').update({ status: 'rejeitada', decidido_em: new Date().toISOString(), criado_em: new Date(Date.now() - 61*24*3600*1000).toISOString() }).eq('id', proposta.id);
  const rejeitadaForaDoPrazo = await asOwner.from('PropostaCompletarCadastro').select('criado_em').eq('id', proposta.id).single();
  const prazo = new Date(rejeitadaForaDoPrazo.data.criado_em);
  prazo.setDate(prazo.getDate() + 60);
  console.log('rejeitada com 61 dias esta fora do prazo (esperado true):', new Date() > prazo);

  await admin.from('PropostaCompletarCadastro').delete().eq('paciente_id', paciente.id);
  await admin.from('TokenCompletarCadastro').delete().eq('paciente_id', paciente.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  await admin.from('Consultorio').delete().eq('id', consultorio.id);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup concluido');
})();
"
```

Expected: `0` antes de existir proposta; nome `Paciente Data` na busca por token; status `pendente` encontrado; `true` pra "fora do prazo" com 61 dias; cleanup sem erro.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/completar-cadastro.js && git commit -m "feat: adiciona camada de dados de completar cadastro"
```

---

## Task 5: Server actions — `web/lib/actions/completar-cadastro.js`

**Files:**
- Create: `web/lib/actions/completar-cadastro.js`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`.
- Produces:
  - `gerarLinkCompletarCadastro(pacienteId, prevState, formData)` → `{ link }` ou `{ error }`.
  - `enviarPropostaCompletarCadastro(token, prevState, formData)` → `{ enviado: true }` ou `{ error }`.
  - `aceitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData)` → em sucesso faz `redirect`; em falha `{ error }`.
  - `rejeitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData)` → em sucesso faz `redirect`; em falha `{ error }`.
  Consumidas pelas Tasks 6, 7 e 8.

- [ ] **Step 1: Escrever o arquivo**

```js
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MENSAGENS_ERRO = {
  PACIENTE_NAO_ENCONTRADO: "Paciente não encontrado.",
  TOKEN_INVALIDO: "Este link não é mais válido, peça um novo ao seu profissional.",
  PROPOSTA_NAO_ENCONTRADA: "Proposta não encontrada.",
  JA_DECIDIDA: "Esta proposta já foi decidida.",
  PRAZO_EXPIRADO: "O prazo de 60 dias para aceitar esta proposta já passou.",
};

function mensagemAmigavel(error) {
  const codigo = Object.keys(MENSAGENS_ERRO).find((c) => error?.message?.includes(c));
  return codigo ? MENSAGENS_ERRO[codigo] : "Não foi possível concluir a ação.";
}

export async function gerarLinkCompletarCadastro(pacienteId, prevState, formData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gerar_link_completar_cadastro", {
    p_paciente_id: pacienteId,
  });

  if (error) return { error: mensagemAmigavel(error) };

  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { link: `${origem}/completar-cadastro/${data}` };
}

export async function enviarPropostaCompletarCadastro(token, prevState, formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_proposta_completar_cadastro", {
    p_token: token,
    p_telefone: formData.get("telefone") || null,
    p_email: formData.get("email") || null,
    p_endereco: formData.get("endereco") || null,
    p_cpf: formData.get("cpf") || null,
    p_rg_numero: formData.get("rg_numero") || null,
    p_rg_data_expedicao: formData.get("rg_data_expedicao") || null,
    p_rg_orgao_emissor: formData.get("rg_orgao_emissor") || null,
  });

  if (error) return { error: mensagemAmigavel(error) };

  return { enviado: true };
}

export async function aceitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData) {
  const supabase = await createClient();
  const camposAceitos = formData.getAll("campos");

  const { error } = await supabase.rpc("aceitar_proposta_completar_cadastro", {
    p_proposta_id: propostaId,
    p_campos_aceitos: camposAceitos,
  });

  if (error) return { error: mensagemAmigavel(error) };

  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}`);
}

export async function rejeitarPropostaCompletarCadastro(propostaId, pacienteId, prevState, formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rejeitar_proposta_completar_cadastro", {
    p_proposta_id: propostaId,
  });

  if (error) return { error: mensagemAmigavel(error) };

  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}`);
}
```

- [ ] **Step 2: Build para checar erros de sintaxe/import**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build termina sem erro (o arquivo ainda não é usado em nenhuma página nesta task).

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/completar-cadastro.js && git commit -m "feat: adiciona server actions de completar cadastro"
```

---

## Task 6: Rota pública `/completar-cadastro/[token]`

**Files:**
- Create: `web/app/completar-cadastro/[token]/page.js`
- Create: `web/components/CompletarCadastroForm.js`
- Modify: `web/lib/supabase/proxy.js:7-20` (adicionar `/completar-cadastro` a `PUBLIC_PATHS`)

**Interfaces:**
- Consumes: `buscarDadosCompletarCadastro` (Task 4), `enviarPropostaCompletarCadastro` (Task 5), `CAMPOS_COMPLETAR_CADASTRO` (Task 3).
- Produces: rota pública `/completar-cadastro/[token]`, sem interface consumida por outras tasks — ponta de UI do paciente.

- [ ] **Step 1: Adicionar a rota a `PUBLIC_PATHS`**

Em `web/lib/supabase/proxy.js`, no array `PUBLIC_PATHS`, adicionar `"/completar-cadastro"` (mesmo padrão de `/cadastro`):

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
  "/api/blog/artigos",
];
```

- [ ] **Step 2: Escrever `CompletarCadastroForm.js`**

```jsx
"use client";

import { useActionState } from "react";
import { enviarPropostaCompletarCadastro } from "@/lib/actions/completar-cadastro";
import { CAMPOS_COMPLETAR_CADASTRO } from "@/lib/completar-cadastro-campos";

const estadoInicial = {};

export default function CompletarCadastroForm({ token, dados }) {
  const acaoComToken = enviarPropostaCompletarCadastro.bind(null, token);
  const [state, formAction, pending] = useActionState(acaoComToken, estadoInicial);

  if (state?.enviado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center">
        <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
        <div className="card p-8 max-w-sm space-y-2">
          <h1 className="page-title">Recebemos suas informações</h1>
          <p className="text-sm text-muted">
            O profissional vai revisar antes de atualizar seu cadastro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Olá, {dados.nome}</h1>
        <p className="text-sm text-muted">Confira e atualize suas informações de contato.</p>

        {CAMPOS_COMPLETAR_CADASTRO.map(({ chave, rotulo, tipo }) => (
          <div key={chave}>
            <label htmlFor={chave} className="block text-sm font-semibold text-navy">
              {rotulo}
            </label>
            <input
              id={chave}
              name={chave}
              type={tipo}
              defaultValue={dados[chave] ?? ""}
              className="field"
            />
          </div>
        ))}

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Enviando..." : "Enviar atualização"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Escrever a página**

```jsx
import { buscarDadosCompletarCadastro } from "@/lib/data/completar-cadastro";
import CompletarCadastroForm from "@/components/CompletarCadastroForm";

export default async function PaginaCompletarCadastro({ params }) {
  const { token } = await params;
  const dados = await buscarDadosCompletarCadastro(token);

  if (!dados) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center">
        <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
        <div className="card p-8 max-w-sm space-y-2">
          <h1 className="page-title">Link inválido</h1>
          <p className="text-sm text-muted">
            Este link não é mais válido. Peça um novo ao seu profissional.
          </p>
        </div>
      </div>
    );
  }

  return <CompletarCadastroForm token={token} dados={dados} />;
}
```

- [ ] **Step 4: Build para checar erros de sintaxe/import/rota**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build termina sem erro e lista a nova rota `/completar-cadastro/[token]` no output.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/app/completar-cadastro web/components/CompletarCadastroForm.js web/lib/supabase/proxy.js && git commit -m "feat: adiciona rota publica de completar cadastro do paciente"
```

---

## Task 7: Botão "Gerar link" + aviso de proposta na ficha do paciente

**Files:**
- Create: `web/components/GerarLinkCadastroBotao.js`
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js`

**Interfaces:**
- Consumes: `gerarLinkCompletarCadastro` (Task 5), `buscarPropostaAtiva` (Task 4).
- Produces: nenhuma interface nova consumida por outra task além do link pra Task 8 (`/pacientes/[id]/proposta-cadastro`).

- [ ] **Step 1: Escrever `GerarLinkCadastroBotao.js`**

```jsx
"use client";

import { useActionState, useState } from "react";
import { gerarLinkCompletarCadastro } from "@/lib/actions/completar-cadastro";

const estadoInicial = {};

export default function GerarLinkCadastroBotao({ pacienteId }) {
  const acaoComId = gerarLinkCompletarCadastro.bind(null, pacienteId);
  const [state, formAction, pending] = useActionState(acaoComId, estadoInicial);
  const [copiado, setCopiado] = useState(false);

  function copiarLink() {
    navigator.clipboard.writeText(state.link);
    setCopiado(true);
  }

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <button type="submit" disabled={pending} className="link disabled:opacity-50">
          {pending ? "Gerando..." : "Gerar link de atualização"}
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state?.link && (
        <div className="card p-4 text-sm space-y-2">
          <p className="text-muted">Envie este link ao paciente (válido por 7 dias, uso único):</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.link} className="field flex-1" />
            <button type="button" onClick={copiarLink} className="link text-sm">
              {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Adicionar o botão e o aviso na aba "Dados"**

Substituir o conteúdo inteiro de `web/app/(app)/(gestao)/pacientes/[id]/page.js` por:

```jsx
import Link from "next/link";
import { buscarPaciente, listarSessoesDoPaciente } from "@/lib/data/pacientes";
import { buscarAnamnese, listarFollowupsAnamnese } from "@/lib/data/anamnese";
import { buscarPropostaAtiva } from "@/lib/data/completar-cadastro";
import { CAMPOS_ANAMNESE } from "@/lib/anamnese-campos";
import { diaDaSemanaAbreviado } from "@/lib/periodo-agenda";
import { desativarPaciente, reativarPaciente } from "@/lib/actions/pacientes";
import ExcluirPacienteBotao from "@/components/ExcluirPacienteBotao";
import GerarLinkCadastroBotao from "@/components/GerarLinkCadastroBotao";

const ABAS = [
  { chave: "dados", rotulo: "Dados" },
  { chave: "anamnese", rotulo: "Anamnese" },
  { chave: "sessoes", rotulo: "Sessões" },
];

function rotuloCampo(chave) {
  return CAMPOS_ANAMNESE.find((c) => c.chave === chave)?.rotulo ?? chave;
}

export default async function PaginaDetalhePaciente({ params, searchParams }) {
  const { id } = await params;
  const { aba: abaParam } = await searchParams;
  const aba = ABAS.some((a) => a.chave === abaParam) ? abaParam : "dados";
  const pacienteId = Number(id);
  const [paciente, sessoes, anamnese, followups, propostaAtiva] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesDoPaciente(pacienteId),
    buscarAnamnese(pacienteId),
    listarFollowupsAnamnese(pacienteId),
    buscarPropostaAtiva(pacienteId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{paciente.nome}</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/agenda/nova-sessao?paciente=${pacienteId}`} className="link">
            Nova Sessão
          </Link>
          <Link href="/recibos" className="link">
            Gerar Recibo
          </Link>
          <Link href={`/pacientes/${pacienteId}/editar`} className="link">
            Editar
          </Link>
          {paciente.ativo ? (
            <>
              <form action={desativarPaciente.bind(null, pacienteId)}>
                <button type="submit" className="link">
                  Desativar
                </button>
              </form>
              <ExcluirPacienteBotao pacienteId={pacienteId} />
            </>
          ) : (
            <form action={reativarPaciente.bind(null, pacienteId)}>
              <button type="submit" className="link">
                Reativar
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b border-border text-sm">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`/pacientes/${pacienteId}?aba=${a.chave}`}
            className={`pb-2 -mb-px border-b-2 font-semibold ${
              aba === a.chave ? "border-primary text-navy" : "border-transparent text-muted"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === "dados" && (
        <div className="space-y-4">
          <div className="card p-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted">Telefone</p>
              <p>{paciente.telefone || "—"}</p>
            </div>
            <div>
              <p className="text-muted">E-mail</p>
              <p>{paciente.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted">Data de nascimento</p>
              <p>{paciente.data_nascimento || "—"}</p>
            </div>
            <div>
              <p className="text-muted">Valor da sessão</p>
              <p>R$ {paciente.valor_sessao}</p>
            </div>
            <div>
              <p className="text-muted">CPF</p>
              <p>{paciente.cpf || "—"}</p>
            </div>
            <div>
              <p className="text-muted">RG</p>
              <p>
                {paciente.rg_numero || "—"}
                {paciente.rg_orgao_emissor && ` · ${paciente.rg_orgao_emissor}`}
                {paciente.rg_data_expedicao && ` · exp. ${paciente.rg_data_expedicao}`}
              </p>
            </div>
            {paciente.dependente && (
              <div className="col-span-2">
                <p className="text-muted">Responsável financeiro</p>
                <p>{paciente.responsavel_nome || "—"}</p>
              </div>
            )}
            {paciente.observacoes && (
              <div className="col-span-2">
                <p className="text-muted">Observações</p>
                <p>{paciente.observacoes}</p>
              </div>
            )}
          </div>

          {propostaAtiva && (
            <div className="card border border-yellow-200 bg-yellow-50 p-4 text-sm">
              <p className="text-navy">
                {propostaAtiva.status === "rejeitada"
                  ? "Uma proposta de atualização foi rejeitada, mas ainda pode ser aceita."
                  : "Tem uma atualização de cadastro esperando revisão."}
              </p>
              <Link href={`/pacientes/${pacienteId}/proposta-cadastro`} className="link">
                Revisar proposta
              </Link>
            </div>
          )}

          <GerarLinkCadastroBotao pacienteId={pacienteId} />
        </div>
      )}

      {aba === "anamnese" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Anamnese</h2>
            <Link href={`/pacientes/${pacienteId}/anamnese/editar`} className="link">
              {anamnese ? "Editar anamnese" : "Registrar anamnese"}
            </Link>
          </div>

          {!anamnese ? (
            <p className="empty-state">Nenhuma anamnese registrada ainda.</p>
          ) : (
            <div className="card p-5 grid grid-cols-2 gap-4 text-sm">
              {CAMPOS_ANAMNESE.map((c) => (
                <div key={c.chave}>
                  <p className="text-muted">{c.rotulo}</p>
                  <p className="whitespace-pre-line">{anamnese[c.chave] || "—"}</p>
                </div>
              ))}
            </div>
          )}

          {followups.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-navy mb-2">Histórico de atualizações</h3>
              <div className="space-y-3">
                {followups.map((f) => (
                  <div key={f.id} className="card p-4 text-sm space-y-2">
                    <p className="text-muted">
                      {new Date(f.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    {f.observacao && <p className="whitespace-pre-line">{f.observacao}</p>}
                    {f.alteracoes.length > 0 && (
                      <ul className="space-y-1">
                        {f.alteracoes.map((alt, i) => (
                          <li key={i} className="whitespace-pre-line">
                            <span className="font-semibold">{rotuloCampo(alt.campo)}:</span>{" "}
                            {alt.valor_anterior || "—"} → {alt.valor_novo || "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "sessoes" && (
        <div>
          {sessoes.length === 0 ? (
            <p className="empty-state">Nenhuma sessão registrada.</p>
          ) : (
            <div className="space-y-3">
              {sessoes.map((s) => (
                <div key={s.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    {s.data} ({diaDaSemanaAbreviado(s.data)}) {s.horario?.slice(0, 5)}
                  </span>
                  <span className="text-muted">{s.tipo_sessao}</span>
                  <span>{s.status ?? "Marcada"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build para checar erros de sintaxe/import**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build termina sem erro.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add "web/app/(app)/(gestao)/pacientes/[id]/page.js" web/components/GerarLinkCadastroBotao.js && git commit -m "feat: adiciona botao de gerar link e aviso de proposta na ficha do paciente"
```

---

## Task 8: Página de revisão da proposta

**Files:**
- Create: `web/app/(app)/(gestao)/pacientes/[id]/proposta-cadastro/page.js`
- Create: `web/components/PropostaCadastroForm.js`

**Interfaces:**
- Consumes: `buscarPaciente` de `@/lib/data/pacientes`, `buscarPropostaAtiva` (Task 4), `aceitarPropostaCompletarCadastro`/`rejeitarPropostaCompletarCadastro` (Task 5), `CAMPOS_COMPLETAR_CADASTRO` (Task 3).
- Produces: rota `/pacientes/[id]/proposta-cadastro`, linkada pela Task 7.

- [ ] **Step 1: Escrever `PropostaCadastroForm.js`**

```jsx
"use client";

import { useActionState } from "react";
import { CAMPOS_COMPLETAR_CADASTRO } from "@/lib/completar-cadastro-campos";

const estadoInicial = {};

export default function PropostaCadastroForm({ paciente, proposta, acaoAceitar, acaoRejeitar }) {
  const [stateAceitar, formActionAceitar, pendingAceitar] = useActionState(acaoAceitar, estadoInicial);
  const [stateRejeitar, formActionRejeitar, pendingRejeitar] = useActionState(acaoRejeitar, estadoInicial);

  return (
    <div className="space-y-4">
      {proposta.status === "rejeitada" && (
        <p className="text-sm text-muted">
          Rejeitada em {new Date(proposta.decidido_em).toLocaleDateString("pt-BR")}, ainda pode aceitar até{" "}
          {new Date(proposta.prazoAceite).toLocaleDateString("pt-BR")}.
        </p>
      )}

      <form action={formActionAceitar} className="card p-6 space-y-4">
        {CAMPOS_COMPLETAR_CADASTRO.map(({ chave, rotulo }) => (
          <div key={chave} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`campo_${chave}`}
              name="campos"
              value={chave}
              defaultChecked
              className="mt-1"
            />
            <label htmlFor={`campo_${chave}`} className="text-sm flex-1">
              <span className="block font-semibold text-navy">{rotulo}</span>
              <span className="block text-muted">Atual: {paciente[chave] || "—"}</span>
              <span className="block">Proposto: {proposta[`${chave}_pendente`] || "—"}</span>
            </label>
          </div>
        ))}

        {stateAceitar?.error && <p className="text-sm text-red-600">{stateAceitar.error}</p>}

        <button type="submit" disabled={pendingAceitar} className="btn-primary disabled:opacity-50">
          {pendingAceitar
            ? "Aplicando..."
            : proposta.status === "rejeitada"
              ? "Aceitar mesmo assim"
              : "Aceitar selecionados"}
        </button>
      </form>

      {proposta.status === "pendente" && (
        <form action={formActionRejeitar}>
          {stateRejeitar?.error && <p className="text-sm text-red-600">{stateRejeitar.error}</p>}
          <button type="submit" disabled={pendingRejeitar} className="link text-red-600 disabled:opacity-50">
            {pendingRejeitar ? "Rejeitando..." : "Rejeitar"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escrever a página**

```jsx
import { redirect } from "next/navigation";
import { buscarPaciente } from "@/lib/data/pacientes";
import { buscarPropostaAtiva } from "@/lib/data/completar-cadastro";
import { aceitarPropostaCompletarCadastro, rejeitarPropostaCompletarCadastro } from "@/lib/actions/completar-cadastro";
import PropostaCadastroForm from "@/components/PropostaCadastroForm";

export default async function PaginaPropostaCadastro({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, proposta] = await Promise.all([
    buscarPaciente(pacienteId),
    buscarPropostaAtiva(pacienteId),
  ]);

  if (!proposta) {
    redirect(`/pacientes/${pacienteId}`);
  }

  const acaoAceitar = aceitarPropostaCompletarCadastro.bind(null, proposta.id, pacienteId);
  const acaoRejeitar = rejeitarPropostaCompletarCadastro.bind(null, proposta.id, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Proposta de atualização — {paciente.nome}</h1>
      <PropostaCadastroForm
        paciente={paciente}
        proposta={proposta}
        acaoAceitar={acaoAceitar}
        acaoRejeitar={acaoRejeitar}
      />
    </div>
  );
}
```

- [ ] **Step 3: Build para checar erros de sintaxe/import/rota**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build termina sem erro e lista a nova rota `/pacientes/[id]/proposta-cadastro`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add "web/app/(app)/(gestao)/pacientes/[id]/proposta-cadastro" web/components/PropostaCadastroForm.js && git commit -m "feat: adiciona pagina de revisao da proposta de cadastro"
```

---

## Task 9: Verificação end-to-end no navegador + atualizar backlog

**Files:** nenhum de código (só verificação manual/via browser + `docs/backlog.md`).

**Interfaces:**
- Consumes: todas as anteriores.

- [ ] **Step 1: Build + preview local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build && npm run start
```

Servidor sobe apontando pro Supabase de produção (mesmo padrão dos planos anteriores) — nunca testar contra `npm run dev`.

- [ ] **Step 2: Gerar link e abrir sem login**

Com um paciente descartável já logado como o profissional: abrir `/pacientes/[id]`, clicar "Gerar link de atualização", copiar o link mostrado. Em uma janela anônima do navegador (via Playwright CLI, sessão sem cookies), abrir o link e confirmar que carrega com o nome do paciente e os campos atuais pré-preenchidos.

- [ ] **Step 3: Enviar proposta e ver aviso na ficha**

Alterar telefone e e-mail no formulário público, enviar. Confirmar tela de confirmação. Voltar pra `/pacientes/[id]` logado como profissional, confirmar que aparece o aviso "Tem uma atualização de cadastro esperando revisão."

- [ ] **Step 4: Aceitar desmarcando um campo**

Abrir "Revisar proposta", desmarcar o checkbox do e-mail, clicar "Aceitar selecionados". Confirmar que só o telefone mudou na ficha do paciente (e-mail continua o valor antigo).

- [ ] **Step 5: Rejeitar e aceitar mesmo assim**

Gerar um novo link, enviar outra proposta (ex: mudando o endereço), abrir "Revisar proposta" e clicar "Rejeitar". Confirmar que volta pra ficha sem aplicar a mudança. Abrir "Revisar proposta" de novo (o aviso deve continuar aparecendo, agora como rejeitada) e clicar "Aceitar mesmo assim". Confirmar que o endereço é aplicado.

- [ ] **Step 6: Testar link inválido/expirado/reusado**

Abrir um link já usado (reenviar a mesma URL da Task 2) e confirmar a tela "Link inválido". Opcionalmente, forjar um token expirado via SQL (`update "TokenCompletarCadastro" set expira_em = now() - interval '1 day' where token = '...'`) e confirmar o mesmo comportamento.

- [ ] **Step 7: Confirmar que um segundo link invalida o primeiro**

Gerar um link, sem usá-lo gerar um segundo, tentar abrir o primeiro — confirmar tela "Link inválido".

- [ ] **Step 8: Limpeza**

Apagar paciente/tokens/propostas de teste via script com a service role key (mesmo padrão das Tasks anteriores) ou pela própria UI (excluir paciente já faz cascade nas duas tabelas).

- [ ] **Step 9: Atualizar `docs/backlog.md`**

Mover a linha do item 14 de "A realizar" pra "Implementado", com a data de hoje e uma observação curta (proposta pendente sem prazo, rejeitada com janela de 60 dias pra aceitar mesmo assim, aceite campo a campo com tudo marcado por padrão).

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add docs/backlog.md && git commit -m "docs: marca item 14 (link publico completar cadastro) como implementado"
```
