# Gestão de Recebimentos de Sessão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o pagamento 1:1 por sessão (`PagamentoSessao`) por um modelo de recebimento que cobre múltiplas sessões de uma vez (passadas ou futuras), suporta crédito antecipado para sessões que ainda não existem, e introduz responsáveis financeiros como entidade própria com N:N para pacientes.

**Architecture:** Quatro migrations criam `ResponsavelFinanceiro`/`PacienteResponsavelFinanceiro` (substitui o self-FK em `Paciente`), a coluna `Sessao.valor` (fonte única do valor cobrado, com backfill) e `Recebimento`/`RecebimentoSessao` (cabeçalho/detalhe, substitui `PagamentoSessao`), mais uma migration de dados que provisiona um responsável "próprio" por paciente e migra os `PagamentoSessao` existentes. A lógica de gravação vive em `web/lib/recebimento.js` (substitui `web/lib/pagamento-sessao.js`), consumida por três pontos de entrada de UI: recebimento individual (Agenda + Ficha do Paciente), recebimento em lote (Ficha do Paciente), e uso de crédito antecipado.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions), Supabase Postgres + PostgREST embeds. Sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc (`pg` para migrations, `@supabase/supabase-js` com service role para camada de dados) e chrome-devtools MCP para fluxos de UI, seguindo o mesmo padrão do plano anterior (`docs/superpowers/plans/2026-08-11-documentos-dependente-responsavel-financeiro.md`).

**Spec:** `docs/superpowers/specs/2026-08-28-recebimento-sessoes-design.md`

## Global Constraints

- Convenções do projeto: tabelas com nome capitalizado entre aspas (`"Paciente"`), colunas snake_case, migrations em `supabase/migrations/YYYYMMDDhhmmss_descricao.sql`, aplicadas via script Node com `pg` (não há Supabase CLI configurado localmente — `supabase/config.toml` não existe).
- Conexão do banco (mesma usada no plano de 2026-08-11): `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, com `SUPABASE_DB_PASSWORD` já disponível no ambiente do shell.
- Toda tabela nova segue o padrão de RLS do projeto: coluna `owner uuid not null default auth.uid()` + 4 policies (`_select_own`, `_insert_own`, `_update_own`, `_delete_own`) usando `owner = auth.uid() or public.is_admin()` (ver `supabase/migrations/20260826000001_add_classificacao_financeira.sql` e `20260727000003_enable_rls_policies.sql`).
- **Sem pagamento parcial**: um `Recebimento` com sessões já selecionadas sempre cobre o valor cheio delas. Crédito antecipado só existe quando nenhuma sessão é selecionada no momento da criação.
- **Responsável "próprio" automático**: todo paciente (novo ou existente) tem um `ResponsavelFinanceiro` com `paciente_vinculado` apontando pra ele mesmo, vinculado a si via `PacienteResponsavelFinanceiro`. O campo de responsável financeiro nunca fica sem opção.
- **`PagamentoSessao` não é removida do banco** nesta rodada — uma RPC do agente de WhatsApp (`agent_listar_inadimplentes`, fora de `web/`) ainda depende dela. Só o código em `web/` para de escrever/ler essa tabela. Atualizar essa RPC é um plano futuro separado, fora de escopo aqui.
- **Colunas antigas `Paciente.dependente`/`Paciente.responsavel_financeiro` não são removidas do banco** nesta rodada (resolve a "questão em aberto" do spec) — ficam obsoletas mas intactas, preservando o funcionamento de `web/lib/data/recibos.js` (que ainda faz embed nelas) sem exigir alteração nesse arquivo. O Task 17 remove a capacidade de *criar* novos vínculos por esse modelo antigo (o cadastro de paciente para de escrever nessas colunas), sem apagar dados históricos.
- Import padrão em toda `lib/data/*.js` e `lib/actions/*.js`: `import { createClient } from "@/lib/supabase/server";`, chamado como `const supabase = await createClient();` (é `async`).
- `web/AGENTS.md` avisa que este Next.js (16) tem breaking changes vs. treinamento — todo código deste plano replica padrões já existentes e funcionando no repo (Server Actions, `useActionState`, `params`/`searchParams` assíncronos), sem introduzir API nova do framework.

---

## Task 1: Migration — `ResponsavelFinanceiro` + `PacienteResponsavelFinanceiro`

**Files:**
- Create: `supabase/migrations/20260829000001_add_responsavel_financeiro.sql`

**Interfaces:**
- Produces: tabelas `"ResponsavelFinanceiro"` (`id, created_at, nome, cpf_cnpj, telefone, email, paciente_vinculado, owner`) e `"PacienteResponsavelFinanceiro"` (`id, created_at, paciente, responsavel, owner`, unique `(paciente, responsavel)`), ambas com RLS.

- [ ] **Step 1: Escrever a migration**

```sql
-- Responsavel financeiro: entidade propria (nao mais um self-FK em
-- Paciente), com vinculo opcional a um Paciente (quando o responsavel
-- tambem e um paciente cadastrado) e N:N com os pacientes pelos quais
-- paga. Substitui o modelo de Paciente.dependente/responsavel_financeiro
-- (dados migrados na migration 20260829000004).
create table "ResponsavelFinanceiro" (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  email text,
  paciente_vinculado bigint references "Paciente"(id),
  owner uuid not null default auth.uid()
);

create table "PacienteResponsavelFinanceiro" (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  paciente bigint not null references "Paciente"(id),
  responsavel bigint not null references "ResponsavelFinanceiro"(id),
  owner uuid not null default auth.uid(),
  unique (paciente, responsavel)
);

alter table "ResponsavelFinanceiro" enable row level security;
alter table "PacienteResponsavelFinanceiro" enable row level security;

create policy "responsavelfinanceiro_select_own" on "ResponsavelFinanceiro"
  for select using (owner = auth.uid() or public.is_admin());
create policy "responsavelfinanceiro_insert_own" on "ResponsavelFinanceiro"
  for insert with check (owner = auth.uid());
create policy "responsavelfinanceiro_update_own" on "ResponsavelFinanceiro"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "responsavelfinanceiro_delete_own" on "ResponsavelFinanceiro"
  for delete using (owner = auth.uid() or public.is_admin());

create policy "pacienteresponsavelfinanceiro_select_own" on "PacienteResponsavelFinanceiro"
  for select using (owner = auth.uid() or public.is_admin());
create policy "pacienteresponsavelfinanceiro_insert_own" on "PacienteResponsavelFinanceiro"
  for insert with check (owner = auth.uid());
create policy "pacienteresponsavelfinanceiro_update_own" on "PacienteResponsavelFinanceiro"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "pacienteresponsavelfinanceiro_delete_own" on "PacienteResponsavelFinanceiro"
  for delete using (owner = auth.uid() or public.is_admin());
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260829000001_add_responsavel_financeiro.sql', 'utf8');
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

- [ ] **Step 3: Verificar tabelas, colunas e policies**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select table_name, column_name, data_type from information_schema.columns where table_name in ('ResponsavelFinanceiro','PacienteResponsavelFinanceiro') order by table_name, ordinal_position\");
  console.table(cols.rows);
  const pols = await client.query(\"select tablename, policyname from pg_policies where tablename in ('ResponsavelFinanceiro','PacienteResponsavelFinanceiro') order by tablename, policyname\");
  console.table(pols.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: colunas de ambas as tabelas listadas conforme o Step 1, e 4 policies para cada tabela.

- [ ] **Step 4: Testar o unique constraint com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste RF Paciente', valor_sessao: 100 }).select('id').single();
  const { data: resp, error: erroResp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste RF Responsavel', paciente_vinculado: paciente.id }).select('id').single();
  console.log('cria responsavel, erro esperado null:', erroResp?.message || 'OK id=' + resp?.id);

  const { error: erroVinculo1 } = await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: paciente.id, responsavel: resp.id });
  console.log('primeiro vinculo, erro esperado null:', erroVinculo1?.message || 'OK');

  const { error: erroVinculoDup } = await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: paciente.id, responsavel: resp.id });
  console.log('vinculo duplicado, esperado falhar:', erroVinculoDup?.message);

  await admin.from('PacienteResponsavelFinanceiro').delete().eq('paciente', paciente.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: as duas primeiras inserções funcionam, a duplicada falha citando a unique constraint, cleanup remove tudo.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260829000001_add_responsavel_financeiro.sql && git commit -m "feat: cria tabelas ResponsavelFinanceiro e PacienteResponsavelFinanceiro"
```

---

## Task 2: Migration — `Sessao.valor` + backfill

**Files:**
- Create: `supabase/migrations/20260829000002_add_valor_sessao.sql`

**Interfaces:**
- Produces: coluna `"Sessao".valor numeric not null`, preenchida em todas as linhas existentes com `Paciente.valor_sessao` do paciente vinculado.

- [ ] **Step 1: Escrever a migration**

```sql
-- Valor da sessao passa a ser gravado na propria Sessao (fonte da
-- verdade para cobranca), em vez de sempre herdado via join de
-- Paciente.valor_sessao. Sessoes existentes recebem o valor atual do
-- paciente vinculado; sessoes novas usam esse mesmo valor como default,
-- mas ficam editaveis independente do cadastro do paciente.
alter table "Sessao" add column valor numeric;

update "Sessao" s
set valor = p.valor_sessao
from "Paciente" p
where s.paciente = p.id
  and s.valor is null;

alter table "Sessao" alter column valor set not null;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260829000002_add_valor_sessao.sql', 'utf8');
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

Expected: imprime `migration aplicada` sem erro (se alguma `Sessao` existente tiver `paciente` órfão ou `Paciente.valor_sessao` nulo, o `alter column valor set not null` falha aqui — investigar e corrigir os dados antes de prosseguir, não contornar com `coalesce`).

- [ ] **Step 3: Verificar coluna e backfill**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const col = await client.query(\"select column_name, data_type, is_nullable from information_schema.columns where table_name = 'Sessao' and column_name = 'valor'\");
  console.table(col.rows);
  const semValor = await client.query('select count(*) from \"Sessao\" where valor is null');
  console.log('sessoes sem valor (esperado 0):', semValor.rows[0].count);
  const divergentes = await client.query('select count(*) from \"Sessao\" s join \"Paciente\" p on p.id = s.paciente where s.valor <> p.valor_sessao');
  console.log('sessoes com valor diferente do paciente logo apos backfill (esperado 0):', divergentes.rows[0].count);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: coluna `valor` do tipo `numeric`, `is_nullable = NO`; ambas as contagens em 0 (backfill cobriu tudo e refletiu exatamente o valor do paciente no momento da migration).

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260829000002_add_valor_sessao.sql && git commit -m "feat: adiciona Sessao.valor com backfill do valor do paciente"
```

---

## Task 3: Migration — `Recebimento` + `RecebimentoSessao`

**Files:**
- Create: `supabase/migrations/20260829000003_add_recebimento.sql`

**Interfaces:**
- Consumes: `Sessao.valor` (Task 2), `ResponsavelFinanceiro` (Task 1).
- Produces: tabelas `"Recebimento"` (`id, created_at, paciente, responsavel_financeiro, data_recebimento, valor_total, forma_pagamento, conta, lancamento, owner`) e `"RecebimentoSessao"` (`id, created_at, recebimento, sessao, valor_aplicado, owner`, unique `(recebimento, sessao)`), ambas com RLS.

- [ ] **Step 1: Escrever a migration**

```sql
-- Recebimento substitui PagamentoSessao: um recebimento pode cobrir
-- multiplas sessoes (RecebimentoSessao, uma linha por sessao alocada) ou
-- nenhuma ainda (credito antecipado — saldo = valor_total menos a soma
-- dos valor_aplicado ja lancados). O LancamentoFinanceiro (Receita) e
-- criado junto com o Recebimento, no valor total, independente de ja
-- haver sessao alocada.
create table "Recebimento" (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  paciente bigint not null references "Paciente"(id),
  responsavel_financeiro bigint not null references "ResponsavelFinanceiro"(id),
  data_recebimento date not null,
  valor_total numeric not null check (valor_total > 0),
  forma_pagamento text not null check (forma_pagamento in ('Dinheiro', 'Pix', 'Cartão')),
  conta bigint not null references "ContaFinanceira"(id),
  lancamento bigint not null references "LancamentoFinanceiro"(id),
  owner uuid not null default auth.uid()
);

create table "RecebimentoSessao" (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  recebimento bigint not null references "Recebimento"(id),
  sessao bigint not null references "Sessao"(id),
  valor_aplicado numeric not null check (valor_aplicado > 0),
  owner uuid not null default auth.uid(),
  unique (recebimento, sessao)
);

alter table "Recebimento" enable row level security;
alter table "RecebimentoSessao" enable row level security;

create policy "recebimento_select_own" on "Recebimento"
  for select using (owner = auth.uid() or public.is_admin());
create policy "recebimento_insert_own" on "Recebimento"
  for insert with check (owner = auth.uid());
create policy "recebimento_update_own" on "Recebimento"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "recebimento_delete_own" on "Recebimento"
  for delete using (owner = auth.uid() or public.is_admin());

create policy "recebimentosessao_select_own" on "RecebimentoSessao"
  for select using (owner = auth.uid() or public.is_admin());
create policy "recebimentosessao_insert_own" on "RecebimentoSessao"
  for insert with check (owner = auth.uid());
create policy "recebimentosessao_update_own" on "RecebimentoSessao"
  for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());
create policy "recebimentosessao_delete_own" on "RecebimentoSessao"
  for delete using (owner = auth.uid() or public.is_admin());
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260829000003_add_recebimento.sql', 'utf8');
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

- [ ] **Step 3: Verificar tabelas, checks e policies**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select table_name, column_name, data_type, is_nullable from information_schema.columns where table_name in ('Recebimento','RecebimentoSessao') order by table_name, ordinal_position\");
  console.table(cols.rows);
  const pols = await client.query(\"select tablename, policyname from pg_policies where tablename in ('Recebimento','RecebimentoSessao') order by tablename, policyname\");
  console.table(pols.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: colunas conforme o Step 1 (`lancamento` e `responsavel_financeiro` com `is_nullable = NO`), 4 policies por tabela.

- [ ] **Step 4: Testar checks e unique com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Receb Paciente', valor_sessao: 150 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Receb Responsavel', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-08-01', horario: '10:00', valor: 150, Realizado: true }).select('id').single();
  const { data: lancamento } = await admin.from('LancamentoFinanceiro').insert({ data: '2026-08-01', descricao: 'Teste', valor: 150, tipo: 'Receita', conta: conta.id }).select('id').single();

  const { error: erroFormaInvalida } = await admin.from('Recebimento').insert({ paciente: paciente.id, responsavel_financeiro: resp.id, data_recebimento: '2026-08-01', valor_total: 150, forma_pagamento: 'Boleto', conta: conta.id, lancamento: lancamento.id });
  console.log('forma_pagamento invalida, esperado falhar:', erroFormaInvalida?.message);

  const { data: recebimento, error: erroRecebimento } = await admin.from('Recebimento').insert({ paciente: paciente.id, responsavel_financeiro: resp.id, data_recebimento: '2026-08-01', valor_total: 150, forma_pagamento: 'Pix', conta: conta.id, lancamento: lancamento.id }).select('id').single();
  console.log('recebimento valido, erro esperado null:', erroRecebimento?.message || 'OK id=' + recebimento?.id);

  const { error: erroValorZero } = await admin.from('RecebimentoSessao').insert({ recebimento: recebimento.id, sessao: sessao.id, valor_aplicado: 0 });
  console.log('valor_aplicado zero, esperado falhar:', erroValorZero?.message);

  const { error: erroAlocacao } = await admin.from('RecebimentoSessao').insert({ recebimento: recebimento.id, sessao: sessao.id, valor_aplicado: 150 });
  console.log('alocacao valida, erro esperado null:', erroAlocacao?.message || 'OK');

  const { error: erroDup } = await admin.from('RecebimentoSessao').insert({ recebimento: recebimento.id, sessao: sessao.id, valor_aplicado: 150 });
  console.log('alocacao duplicada, esperado falhar:', erroDup?.message);

  await admin.from('RecebimentoSessao').delete().eq('recebimento', recebimento.id);
  await admin.from('Recebimento').delete().eq('id', recebimento.id);
  await admin.from('LancamentoFinanceiro').delete().eq('id', lancamento.id);
  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: forma de pagamento inválida falha (check constraint), recebimento válido e primeira alocação funcionam, `valor_aplicado = 0` falha, alocação duplicada falha (unique), cleanup remove tudo.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260829000003_add_recebimento.sql && git commit -m "feat: cria tabelas Recebimento e RecebimentoSessao"
```

---

## Task 4: Migration — backfill de dados (responsável próprio, dependentes, `PagamentoSessao` legado)

**Files:**
- Create: `supabase/migrations/20260829000004_backfill_responsavel_e_recebimento.sql`

**Interfaces:**
- Consumes: tabelas dos Tasks 1 e 3, colunas legadas `Paciente.dependente`/`Paciente.responsavel_financeiro`, tabela `PagamentoSessao`.
- Produces: um `ResponsavelFinanceiro` + vínculo próprio por paciente existente; vínculos `PacienteResponsavelFinanceiro` para os dependentes atuais; um `Recebimento`/`RecebimentoSessao` por `PagamentoSessao` existente, reaproveitando o `LancamentoFinanceiro` já criado.

- [ ] **Step 1: Escrever a migration**

```sql
-- 1) Responsavel financeiro "proprio": todo paciente ganha um
--    ResponsavelFinanceiro apontando pra si mesmo, e um vinculo N:N
--    consigo mesmo. Garante que o campo de responsavel no recebimento
--    nunca fica sem opcao (caso comum: paciente nao dependente).
insert into "ResponsavelFinanceiro" (nome, paciente_vinculado, owner)
select p.nome, p.id, p.owner
from "Paciente" p;

insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
select p.id, rf.id, p.owner
from "Paciente" p
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = p.id;

-- 2) Dependentes: vincula o dependente ao responsavel PROPRIO do
--    paciente que hoje e o seu responsavel_financeiro (reaproveita o
--    registro proprio dele em vez de criar um novo responsavel).
insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
select p.id, rf.id, p.owner
from "Paciente" p
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = p.responsavel_financeiro
where p.dependente = true and p.responsavel_financeiro is not null;

-- 3) Migra PagamentoSessao existentes para Recebimento/RecebimentoSessao,
--    reaproveitando o LancamentoFinanceiro ja existente (sem duplicar
--    receita). Responsavel usado: o "proprio" do paciente da sessao —
--    nao ha como saber quem pagou de fato nos dados historicos.
insert into "Recebimento" (paciente, responsavel_financeiro, data_recebimento, valor_total, forma_pagamento, conta, lancamento, owner)
select s.paciente, rf.id, ps.data_pagamento, ps.valor, ps.forma_pagamento, ps.conta, ps.lancamento, s.owner
from "PagamentoSessao" ps
join "Sessao" s on s.id = ps.sessao
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = s.paciente;

insert into "RecebimentoSessao" (recebimento, sessao, valor_aplicado, owner)
select r.id, ps.sessao, ps.valor, s.owner
from "PagamentoSessao" ps
join "Sessao" s on s.id = ps.sessao
join "Recebimento" r on r.lancamento = ps.lancamento;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260829000004_backfill_responsavel_e_recebimento.sql', 'utf8');
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

- [ ] **Step 3: Verificar contagens batendo com os dados originais**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const pacientes = await client.query('select count(*) from \"Paciente\"');
  const responsaveisProprios = await client.query('select count(*) from \"ResponsavelFinanceiro\" where paciente_vinculado is not null');
  console.log('pacientes:', pacientes.rows[0].count, '== responsaveis proprios:', responsaveisProprios.rows[0].count);

  const dependentes = await client.query(\"select count(*) from \\\"Paciente\\\" where dependente = true and responsavel_financeiro is not null\");
  const vinculosDependente = await client.query(\"select count(*) from \\\"PacienteResponsavelFinanceiro\\\" prf join \\\"Paciente\\\" p on p.id = prf.paciente where p.dependente = true and prf.responsavel <> (select id from \\\"ResponsavelFinanceiro\\\" where paciente_vinculado = p.id)\");
  console.log('dependentes:', dependentes.rows[0].count, '== vinculos ao responsavel de terceiros:', vinculosDependente.rows[0].count);

  const pagamentos = await client.query('select count(*) from \"PagamentoSessao\"');
  const recebimentoSessoes = await client.query('select count(*) from \"RecebimentoSessao\"');
  console.log('PagamentoSessao:', pagamentos.rows[0].count, '== RecebimentoSessao migradas:', recebimentoSessoes.rows[0].count);

  const somaDivergente = await client.query('select count(*) from \"PagamentoSessao\" ps join \"RecebimentoSessao\" rs on rs.sessao = ps.sessao and rs.valor_aplicado = ps.valor where true');
  console.log('RecebimentoSessao com valor batendo o PagamentoSessao original:', somaDivergente.rows[0].count, '(deve ser igual ao total de PagamentoSessao)');
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: as três primeiras comparações batem exatamente; a última contagem é igual ao total de `PagamentoSessao`.

- [ ] **Step 4: Verificar que uma sessão paga não vira inadimplente pela nova regra**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: pagas } = await admin.from('PagamentoSessao').select('sessao').limit(5);
  if (!pagas || pagas.length === 0) { console.log('nenhum PagamentoSessao existente pra validar (ok se o projeto nao tem nenhum ainda)'); return; }

  for (const p of pagas) {
    const { data: sessao } = await admin.from('Sessao').select('id, valor').eq('id', p.sessao).single();
    const { data: alocacoes } = await admin.from('RecebimentoSessao').select('valor_aplicado').eq('sessao', p.sessao);
    const somaAplicada = (alocacoes ?? []).reduce((soma, a) => soma + Number(a.valor_aplicado), 0);
    console.log('sessao', sessao.id, 'valor', sessao.valor, 'soma recebida', somaAplicada, 'quitada:', somaAplicada >= Number(sessao.valor));
  }
})();
"
```

Expected: para toda sessão com `PagamentoSessao` anterior, `somaAplicada >= sessao.valor` (quitada = `true`).

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260829000004_backfill_responsavel_e_recebimento.sql && git commit -m "feat: migra responsavel financeiro proprio e PagamentoSessao para Recebimento"
```

---

## Task 5: Camada de dados — `lib/data/responsaveis-financeiros.js`

**Files:**
- Create: `web/lib/data/responsaveis-financeiros.js`

**Interfaces:**
- Consumes: tabelas do Task 1.
- Produces:
  - `listarResponsaveisDoPaciente(pacienteId)` → `Promise<Array<{id, nome, cpf_cnpj, telefone, email, eh_proprio}>>`
  - `listarResponsaveisParaVincular(pacienteId)` → `Promise<Array<{id, nome}>>` (responsáveis ainda não vinculados a esse paciente)
  - `listarResponsaveisFinanceiros()` → `Promise<Array<{id, nome, cpf_cnpj, telefone, email, qtd_pacientes}>>`
  - `buscarResponsavelFinanceiro(id)` → `Promise<{id, nome, cpf_cnpj, telefone, email, pacientes: Array<{id, nome}>}>`

- [ ] **Step 1: Escrever o arquivo**

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarResponsaveisDoPaciente(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .select("ResponsavelFinanceiro!inner(id, nome, cpf_cnpj, telefone, email, paciente_vinculado)")
    .eq("paciente", pacienteId);

  if (error) throw new Error(error.message);

  return data.map((v) =>
    normalizarIds(
      {
        id: v.ResponsavelFinanceiro.id,
        nome: v.ResponsavelFinanceiro.nome,
        cpf_cnpj: v.ResponsavelFinanceiro.cpf_cnpj,
        telefone: v.ResponsavelFinanceiro.telefone,
        email: v.ResponsavelFinanceiro.email,
        eh_proprio: Number(v.ResponsavelFinanceiro.paciente_vinculado) === Number(pacienteId),
      },
      ["id"]
    )
  );
}

export async function listarResponsaveisParaVincular(pacienteId) {
  const supabase = await createClient();
  const { data: jaVinculados, error: erroVinculados } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .select("responsavel")
    .eq("paciente", pacienteId);

  if (erroVinculados) throw new Error(erroVinculados.message);

  const idsVinculados = jaVinculados.map((v) => v.responsavel);

  let query = supabase.from("ResponsavelFinanceiro").select("id, nome").order("nome");
  if (idsVinculados.length > 0) query = query.not("id", "in", `(${idsVinculados.join(",")})`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]);
}

export async function listarResponsaveisFinanceiros() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ResponsavelFinanceiro")
    .select("id, nome, cpf_cnpj, telefone, email, PacienteResponsavelFinanceiro(paciente)")
    .order("nome");

  if (error) throw new Error(error.message);

  return data.map((r) =>
    normalizarIds(
      {
        id: r.id,
        nome: r.nome,
        cpf_cnpj: r.cpf_cnpj,
        telefone: r.telefone,
        email: r.email,
        qtd_pacientes: r.PacienteResponsavelFinanceiro?.length ?? 0,
      },
      ["id"]
    )
  );
}

export async function buscarResponsavelFinanceiro(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ResponsavelFinanceiro")
    .select("id, nome, cpf_cnpj, telefone, email, PacienteResponsavelFinanceiro(Paciente(id, nome))")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  return {
    ...normalizarIds({ id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, telefone: data.telefone, email: data.email }, ["id"]),
    pacientes: normalizarIdsLista(
      (data.PacienteResponsavelFinanceiro ?? []).map((v) => v.Paciente),
      ["id"]
    ),
  };
}
```

- [ ] **Step 2: Verificar com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: filho } = await admin.from('Paciente').insert({ nome: 'Teste RD Filho', valor_sessao: 100 }).select('id').single();
  const { data: respProprio } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste RD Filho', paciente_vinculado: filho.id }).select('id').single();
  await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: filho.id, responsavel: respProprio.id });

  const { data: mae } = await admin.from('Paciente').insert({ nome: 'Teste RD Mae', valor_sessao: 100 }).select('id').single();
  const { data: respMae } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste RD Mae', paciente_vinculado: mae.id }).select('id').single();
  await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: mae.id, responsavel: respMae.id });
  await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: filho.id, responsavel: respMae.id });

  const { data: doFilho } = await admin
    .from('PacienteResponsavelFinanceiro')
    .select('ResponsavelFinanceiro!inner(id, nome, paciente_vinculado)')
    .eq('paciente', filho.id);
  console.log('responsaveis do filho (esperado 2, um proprio):', doFilho.map((v) => ({ nome: v.ResponsavelFinanceiro.nome, proprio: v.ResponsavelFinanceiro.paciente_vinculado === filho.id })));

  const { data: relatorio } = await admin
    .from('ResponsavelFinanceiro')
    .select('id, nome, PacienteResponsavelFinanceiro(paciente)')
    .eq('id', respMae.id)
    .single();
  console.log('qtd_pacientes da mae (esperado 2):', relatorio.PacienteResponsavelFinanceiro.length);

  await admin.from('PacienteResponsavelFinanceiro').delete().in('paciente', [filho.id, mae.id]);
  await admin.from('ResponsavelFinanceiro').delete().in('id', [respProprio.id, respMae.id]);
  await admin.from('Paciente').delete().in('id', [filho.id, mae.id]);
  console.log('cleanup done');
})();
"
```

Expected: filho tem 2 responsáveis (um `eh_proprio`, um não), mãe aparece com `qtd_pacientes = 2`.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/responsaveis-financeiros.js && git commit -m "feat: adiciona camada de leitura de responsaveis financeiros"
```

---

## Task 6: Server Actions — `lib/actions/responsaveis-financeiros.js`

**Files:**
- Create: `web/lib/actions/responsaveis-financeiros.js`

**Interfaces:**
- Consumes: tabelas do Task 1.
- Produces:
  - `criarResponsavelFinanceiro(prevState, formData)` — cria um `ResponsavelFinanceiro` avulso ou vinculado a um paciente existente (tela `/responsaveis-financeiros/novo`); redireciona pra `/responsaveis-financeiros`.
  - `criarEVincularResponsavel(pacienteId, prevState, formData)` — cria um `ResponsavelFinanceiro` avulso e já vincula ao paciente numa chamada (usado na Ficha do Paciente).
  - `vincularResponsavelExistente(pacienteId, prevState, formData)` — vincula um responsável já existente ao paciente.
  - `desvincularResponsavel(pacienteId, responsavelId)` — remove o vínculo, exceto o vínculo "próprio" (bloqueado).

- [ ] **Step 1: Escrever o arquivo**

```js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarResponsavelFinanceiro(prevState, formData) {
  const supabase = await createClient();
  const pacienteVinculado = formData.get("paciente_vinculado") ? Number(formData.get("paciente_vinculado")) : null;

  const { error } = await supabase.from("ResponsavelFinanceiro").insert({
    nome: formData.get("nome"),
    cpf_cnpj: formData.get("cpf_cnpj") || null,
    telefone: formData.get("telefone") || null,
    email: formData.get("email") || null,
    paciente_vinculado: pacienteVinculado,
  });

  if (error) {
    return { error: "Não foi possível salvar o responsável financeiro." };
  }

  revalidatePath("/responsaveis-financeiros");
  return { error: null, sucesso: true };
}

export async function criarEVincularResponsavel(pacienteId, prevState, formData) {
  const supabase = await createClient();

  const { data: responsavel, error: erroCriar } = await supabase
    .from("ResponsavelFinanceiro")
    .insert({
      nome: formData.get("nome"),
      cpf_cnpj: formData.get("cpf_cnpj") || null,
      telefone: formData.get("telefone") || null,
      email: formData.get("email") || null,
    })
    .select("id")
    .single();

  if (erroCriar) {
    return { error: "Não foi possível criar o responsável financeiro." };
  }

  const { error: erroVinculo } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .insert({ paciente: pacienteId, responsavel: responsavel.id });

  if (erroVinculo) {
    return { error: "Não foi possível vincular o responsável financeiro." };
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  return { error: null, sucesso: true };
}

export async function vincularResponsavelExistente(pacienteId, prevState, formData) {
  const supabase = await createClient();
  const responsavelId = Number(formData.get("responsavel_id"));

  const { error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .insert({ paciente: pacienteId, responsavel: responsavelId });

  if (error) {
    return { error: "Não foi possível vincular o responsável financeiro." };
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  return { error: null, sucesso: true };
}

export async function desvincularResponsavel(pacienteId, responsavelId) {
  const supabase = await createClient();

  const { data: responsavel, error: erroBusca } = await supabase
    .from("ResponsavelFinanceiro")
    .select("paciente_vinculado")
    .eq("id", responsavelId)
    .single();

  if (erroBusca) {
    throw new Error("Responsável financeiro não encontrado.");
  }

  if (Number(responsavel.paciente_vinculado) === Number(pacienteId)) {
    throw new Error("Não é possível desvincular o responsável próprio do paciente.");
  }

  const { error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .delete()
    .eq("paciente", pacienteId)
    .eq("responsavel", responsavelId);

  if (error) {
    throw new Error("Não foi possível desvincular o responsável financeiro.");
  }

  revalidatePath(`/pacientes/${pacienteId}`);
}
```

Nota: `desvincularResponsavel` e as demais funções `"use server"` deste arquivo dependem de `next/headers` (via `createClient`) e não são testáveis fora de uma requisição real — a validação de comportamento fica para o Task 19 (verificação E2E via navegador). A regra "não desvincula o próprio" está garantida pela leitura acima: `responsavel.paciente_vinculado === pacienteId` é exatamente a definição de `eh_proprio` usada no Task 5.

- [ ] **Step 2: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/responsaveis-financeiros.js && git commit -m "feat: adiciona actions de criacao e vinculo de responsaveis financeiros"
```

---

## Task 7: `Sessao.valor` na camada de dados e nas actions

**Files:**
- Modify: `web/lib/data/sessoes.js`
- Modify: `web/lib/actions/sessoes.js`
- Modify: `web/lib/recorrencia.js`

**Interfaces:**
- Consumes: `Sessao.valor` (Task 2).
- Produces: `listarAgenda` retorna `valor` (de `Sessao.valor`, não mais de `Paciente.valor_sessao`) e `pago` (calculado via soma de `RecebimentoSessao.valor_aplicado` em vez de existência de `PagamentoSessao`). `buscarSessao` retorna `valor` e `paciente_id` (mesmo formato de antes, campo renomeado de `valor_sessao` pra `valor`). `criarSessao` grava `valor` a partir de `Paciente.valor_sessao` no momento da criação. `atualizarSessao` aceita editar `valor`.

- [ ] **Step 1: Editar `listarAgenda` e `buscarSessao` em `web/lib/data/sessoes.js`**

Substituir o arquivo inteiro por:

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarAgenda({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, Realizado, valor, Paciente!inner(id, nome), RecebimentoSessao(valor_aplicado)"
    )
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .order("data")
    .order("horario");

  if (error) throw new Error(error.message);

  return data.map((s) => {
    const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    return normalizarIds(
      {
        id: s.id,
        data: s.data,
        horario: s.horario,
        duracao_min: s.duracao_min,
        status: s.status,
        tipo_sessao: s.tipo_sessao,
        realizado: s.Realizado,
        valor: Number(s.valor),
        pago: valorRecebido >= Number(s.valor),
        paciente_id: s.Paciente.id,
        paciente_nome: s.Paciente.nome,
      },
      ["id", "paciente_id"]
    );
  });
}

export async function buscarSessao(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, duracao_min, status, tipo_sessao, anotacoes, Realizado, valor, Paciente!inner(id, nome)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  return normalizarIds(
    {
      id: data.id,
      data: data.data,
      horario: data.horario,
      duracao_min: data.duracao_min,
      status: data.status,
      tipo_sessao: data.tipo_sessao,
      anotacoes: data.anotacoes,
      realizado: data.Realizado,
      valor: Number(data.valor),
      paciente_id: data.Paciente.id,
      paciente_nome: data.Paciente.nome,
    },
    ["id", "paciente_id"]
  );
}
```

- [ ] **Step 2: Editar `criarSessao` e `atualizarSessao` em `web/lib/actions/sessoes.js`**

Em `criarSessao`, buscar `valor_sessao` do paciente antes do insert e gravar em `Sessao.valor`. Substituir o corpo da função (mantendo a lógica de recorrência já existente) por:

```js
export async function criarSessao(prevState, formData) {
  const supabase = await createClient();

  const paciente = Number(formData.get("paciente"));
  const data = formData.get("data");
  const horario = formData.get("horario");
  const duracao_min = Number(formData.get("duracao_min"));
  const tipoSessao = formData.get("tipo_sessao");

  const { data: pacienteRow, error: erroPaciente } = await supabase
    .from("Paciente")
    .select("valor_sessao")
    .eq("id", paciente)
    .single();

  if (erroPaciente) {
    return { error: "Paciente não encontrado." };
  }

  let recorrenciaCriada = null;

  if (tipoSessao !== "Avulso") {
    const { data: recorrencia, error: erroRecorrencia } = await supabase
      .from("Recorrencia")
      .insert({
        paciente,
        frequencia: tipoSessao,
        horario,
        duracao_min,
        tipo_sessao: tipoSessao,
        data_inicio: data,
        gerado_ate: data,
      })
      .select("id, paciente, frequencia, horario, duracao_min, tipo_sessao, data_inicio, gerado_ate")
      .single();

    if (erroRecorrencia) {
      return { error: "Não foi possível criar a recorrência." };
    }
    recorrenciaCriada = recorrencia;
  }

  const { error } = await supabase.from("Sessao").insert({
    paciente,
    data,
    horario,
    duracao_min,
    tipo_sessao: tipoSessao,
    valor: Number(pacienteRow.valor_sessao),
    status: "Marcada",
    Realizado: false,
    recorrencia_id: recorrenciaCriada?.id ?? null,
  });

  if (error) {
    return { error: "Não foi possível salvar a sessão." };
  }

  if (recorrenciaCriada) {
    await gerarSessoesAteHorizonte(recorrenciaCriada, horizonteAtual());
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/recorrencias");
  redirect("/agenda");
}
```

Em `atualizarSessao`, incluir `valor` no `update`:

```js
export async function atualizarSessao(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({
      paciente: Number(formData.get("paciente")),
      data: formData.get("data"),
      horario: formData.get("horario"),
      duracao_min: Number(formData.get("duracao_min")),
      tipo_sessao: formData.get("tipo_sessao"),
      valor: Number(formData.get("valor")),
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível atualizar a sessão." };
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect("/agenda");
}
```

Nota: `gerarSessoesAteHorizonte` (usado pra estender recorrências, em `web/lib/recorrencia.js`) também insere linhas em `Sessao` diretamente, sem `valor` — depois do Task 2 (`Sessao.valor not null`) isso quebraria a geração automática de recorrências. Corrigido no Step 2b abaixo.

- [ ] **Step 2b: Corrigir `web/lib/recorrencia.js`**

Em `gerarSessoesAteHorizonte`, buscar `Paciente.valor_sessao` do paciente da recorrência antes do loop, e incluir `valor` em cada sessão gerada. Substituir a função (linhas 36-72 hoje) por:

```js
export async function gerarSessoesAteHorizonte(recorrencia, ateISO) {
  const supabase = await createClient();

  const { data: pacienteRow, error: erroPaciente } = await supabase
    .from("Paciente")
    .select("valor_sessao")
    .eq("id", recorrencia.paciente)
    .single();

  if (erroPaciente) throw new Error(erroPaciente.message);

  const novasSessoes = [];
  let dataCursor = recorrencia.gerado_ate;
  let proxima = calcularProximaData(dataCursor, recorrencia.frequencia);

  while (proxima <= ateISO) {
    novasSessoes.push({
      paciente: recorrencia.paciente,
      data: proxima,
      horario: recorrencia.horario,
      duracao_min: recorrencia.duracao_min,
      tipo_sessao: recorrencia.tipo_sessao,
      valor: Number(pacienteRow.valor_sessao),
      status: "Marcada",
      Realizado: false,
      recorrencia_id: recorrencia.id,
    });
    dataCursor = proxima;
    proxima = calcularProximaData(dataCursor, recorrencia.frequencia);
  }

  if (novasSessoes.length > 0) {
    const { error } = await supabase.from("Sessao").insert(novasSessoes);
    if (error) throw new Error(error.message);
  }

  if (dataCursor !== recorrencia.gerado_ate) {
    const { error: erroUpdate } = await supabase
      .from("Recorrencia")
      .update({ gerado_ate: dataCursor })
      .eq("id", recorrencia.id);
    if (erroUpdate) throw new Error(erroUpdate.message);
  }

  return novasSessoes.length;
}
```

- [ ] **Step 3: Verificar com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Valor Sessao', valor_sessao: 180 }).select('id').single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 180, Realizado: false }).select('id').single();

  const { data: viaListarAgenda } = await admin
    .from('Sessao')
    .select('id, valor, Paciente!inner(id, nome), RecebimentoSessao(valor_aplicado)')
    .eq('id', sessao.id)
    .single();
  console.log('valor (esperado 180):', viaListarAgenda.valor, 'pago (esperado false, sem RecebimentoSessao):', (viaListarAgenda.RecebimentoSessao ?? []).length > 0);

  await admin.from('Sessao').update({ valor: 200 }).eq('id', sessao.id);
  const { data: apos } = await admin.from('Sessao').select('valor').eq('id', sessao.id).single();
  console.log('valor apos edicao (esperado 200, independente do valor_sessao do paciente):', apos.valor);

  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: `valor: 180`, sem recebimento associado; após editar, `valor: 200`, sem alterar `Paciente.valor_sessao`.

- [ ] **Step 4: Verificar que a lógica de `gerarSessoesAteHorizonte` grava `valor` nas sessões de recorrência**

`gerarSessoesAteHorizonte` chama `createClient()` internamente (via `@/lib/supabase/server`), que depende de `next/headers` — não é importável direto num script Node fora de uma requisição. O script abaixo reproduz a mesma lógica (mesmo cálculo de `calcularProximaData`, mesmo formato de linha inserida) com o client admin, o suficiente pra validar que `valor` é gravado corretamente:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

const { calcularProximaData } = require('./lib/recorrencia.js');

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Recorrencia Valor', valor_sessao: 220 }).select('id').single();
  const { data: recorrencia } = await admin.from('Recorrencia').insert({ paciente: paciente.id, frequencia: 'Semanal', horario: '10:00', duracao_min: 50, tipo_sessao: 'Semanal', data_inicio: '2026-09-01', gerado_ate: '2026-09-01' }).select('id, paciente, frequencia, horario, duracao_min, tipo_sessao, gerado_ate').single();

  const { data: pacienteRow } = await admin.from('Paciente').select('valor_sessao').eq('id', recorrencia.paciente).single();
  const ateISO = '2026-09-22';
  const novasSessoes = [];
  let dataCursor = recorrencia.gerado_ate;
  let proxima = calcularProximaData(dataCursor, recorrencia.frequencia);
  while (proxima <= ateISO) {
    novasSessoes.push({ paciente: recorrencia.paciente, data: proxima, horario: recorrencia.horario, duracao_min: recorrencia.duracao_min, tipo_sessao: recorrencia.tipo_sessao, valor: Number(pacienteRow.valor_sessao), status: 'Marcada', Realizado: false, recorrencia_id: recorrencia.id });
    dataCursor = proxima;
    proxima = calcularProximaData(dataCursor, recorrencia.frequencia);
  }
  await admin.from('Sessao').insert(novasSessoes);

  const { data: sessoesGeradas } = await admin.from('Sessao').select('id, data, valor').eq('recorrencia_id', recorrencia.id).order('data');
  console.log('sessoes geradas (esperado 3, semanas de 08, 15 e 22/09):', sessoesGeradas.map((s) => s.data));
  console.log('valores das sessoes geradas (esperado todas 220):', sessoesGeradas.map((s) => s.valor));

  await admin.from('Sessao').delete().eq('recorrencia_id', recorrencia.id);
  await admin.from('Recorrencia').delete().eq('id', recorrencia.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: 3 sessões geradas (08, 15 e 22/09/2026), todas com `valor: 220`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/sessoes.js web/lib/actions/sessoes.js web/lib/recorrencia.js && git commit -m "feat: sessao passa a ter valor proprio, editavel independente do paciente"
```

---

## Task 8: `lib/recebimento.js` — lógica de gravação (substitui `lib/pagamento-sessao.js`)

**Files:**
- Create: `web/lib/recebimento.js`

**Interfaces:**
- Consumes: `Recebimento`/`RecebimentoSessao` (Task 3).
- Produces:
  - `criarRecebimento(supabase, { pacienteId, responsavelFinanceiroId, sessoes, valorTotal, contaId, formaPagamento, dataRecebimento })` → `Promise<{ error: string|null, recebimentoId?: number }>`. `sessoes` é `Array<{ id: number, valor: number }>`, podendo ser `[]` (crédito antecipado).
  - `consumirCredito(supabase, { recebimentoId, sessaoId, valorAplicado })` → `Promise<{ error: string|null }>`.

- [ ] **Step 1: Escrever o arquivo**

```js
// Logica de gravacao de recebimento compartilhada entre os fluxos de
// recebimento individual, em lote e credito antecipado. Recebe o client
// Supabase ja autenticado do chamador (mesma convencao do antigo
// criarPagamentoSessao em lib/pagamento-sessao.js), pra rodar dentro da
// mesma acao do chamador.
export async function criarRecebimento(supabase, {
  pacienteId,
  responsavelFinanceiroId,
  sessoes,
  valorTotal,
  contaId,
  formaPagamento,
  dataRecebimento,
}) {
  const { data: lancamento, error: erroLancamento } = await supabase
    .from("LancamentoFinanceiro")
    .insert({
      data: dataRecebimento,
      descricao: "Recebimento de sessão",
      valor: valorTotal,
      tipo: "Receita",
      conta: contaId,
      sessao: null,
    })
    .select("id")
    .single();

  if (erroLancamento) {
    return { error: "Não foi possível registrar o recebimento." };
  }

  const { data: recebimento, error: erroRecebimento } = await supabase
    .from("Recebimento")
    .insert({
      paciente: pacienteId,
      responsavel_financeiro: responsavelFinanceiroId,
      data_recebimento: dataRecebimento,
      valor_total: valorTotal,
      forma_pagamento: formaPagamento,
      conta: contaId,
      lancamento: lancamento.id,
    })
    .select("id")
    .single();

  if (erroRecebimento) {
    return { error: "Não foi possível registrar o recebimento." };
  }

  if (sessoes.length > 0) {
    const { error: erroAlocacao } = await supabase.from("RecebimentoSessao").insert(
      sessoes.map((s) => ({
        recebimento: recebimento.id,
        sessao: s.id,
        valor_aplicado: s.valor,
      }))
    );

    if (erroAlocacao) {
      return { error: "Não foi possível vincular as sessões ao recebimento." };
    }
  }

  return { error: null, recebimentoId: recebimento.id };
}

export async function consumirCredito(supabase, { recebimentoId, sessaoId, valorAplicado }) {
  const { error } = await supabase.from("RecebimentoSessao").insert({
    recebimento: recebimentoId,
    sessao: sessaoId,
    valor_aplicado: valorAplicado,
  });

  if (error) {
    return { error: "Não foi possível usar o crédito nessa sessão." };
  }

  return { error: null };
}
```

- [ ] **Step 2: Verificar `criarRecebimento` com dados descartáveis (sessão única, múltiplas sessões e crédito sem sessão)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

const { criarRecebimento } = require('./lib/recebimento.js');

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Criar Receb', valor_sessao: 100 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Criar Receb', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { data: s1 } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 100, Realizado: true }).select('id').single();
  const { data: s2 } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-08', horario: '09:00', valor: 100, Realizado: false }).select('id').single();

  const loteResult = await criarRecebimento(admin, {
    pacienteId: paciente.id, responsavelFinanceiroId: resp.id,
    sessoes: [{ id: s1.id, valor: 100 }, { id: s2.id, valor: 100 }],
    valorTotal: 200, contaId: conta.id, formaPagamento: 'Pix', dataRecebimento: '2026-09-01',
  });
  console.log('lote de 2 sessoes, erro esperado null:', loteResult.error || 'OK id=' + loteResult.recebimentoId);

  const { data: alocacoes } = await admin.from('RecebimentoSessao').select('sessao, valor_aplicado').eq('recebimento', loteResult.recebimentoId);
  console.log('alocacoes criadas (esperado 2):', alocacoes.length);

  const { data: lancamento } = await admin.from('Recebimento').select('lancamento').eq('id', loteResult.recebimentoId).single();
  const { data: lancamentoRow } = await admin.from('LancamentoFinanceiro').select('valor, tipo, sessao').eq('id', lancamento.lancamento).single();
  console.log('lancamento financeiro: valor', lancamentoRow.valor, 'tipo', lancamentoRow.tipo, 'sessao (esperado null):', lancamentoRow.sessao);

  const creditoResult = await criarRecebimento(admin, {
    pacienteId: paciente.id, responsavelFinanceiroId: resp.id,
    sessoes: [], valorTotal: 300, contaId: conta.id, formaPagamento: 'Dinheiro', dataRecebimento: '2026-09-01',
  });
  console.log('credito sem sessao, erro esperado null:', creditoResult.error || 'OK id=' + creditoResult.recebimentoId);
  const { data: alocacoesCredito } = await admin.from('RecebimentoSessao').select('id').eq('recebimento', creditoResult.recebimentoId);
  console.log('alocacoes do credito (esperado 0):', alocacoesCredito.length);

  await admin.from('RecebimentoSessao').delete().in('recebimento', [loteResult.recebimentoId, creditoResult.recebimentoId]);
  await admin.from('Recebimento').delete().in('id', [loteResult.recebimentoId, creditoResult.recebimentoId]);
  await admin.from('LancamentoFinanceiro').delete().eq('descricao', 'Recebimento de sessão').eq('conta', conta.id).in('valor', [200, 300]);
  await admin.from('Sessao').delete().in('id', [s1.id, s2.id]);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: recebimento em lote cria 2 alocações e um lançamento de R$200 com `sessao: null`; recebimento de crédito cria 0 alocações.

- [ ] **Step 3: Verificar `consumirCredito`**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

const { criarRecebimento, consumirCredito } = require('./lib/recebimento.js');

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Consumir Credito', valor_sessao: 120 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Consumir Credito', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { recebimentoId } = await criarRecebimento(admin, {
    pacienteId: paciente.id, responsavelFinanceiroId: resp.id, sessoes: [],
    valorTotal: 120, contaId: conta.id, formaPagamento: 'Pix', dataRecebimento: '2026-09-01',
  });

  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-15', horario: '09:00', valor: 120, Realizado: false }).select('id').single();

  const resultado = await consumirCredito(admin, { recebimentoId, sessaoId: sessao.id, valorAplicado: 120 });
  console.log('consumir credito, erro esperado null:', resultado.error || 'OK');

  const { data: alocacoes } = await admin.from('RecebimentoSessao').select('valor_aplicado').eq('recebimento', recebimentoId);
  console.log('alocacao apos consumo (esperado 1 linha, valor 120):', alocacoes);

  await admin.from('RecebimentoSessao').delete().eq('recebimento', recebimentoId);
  await admin.from('Recebimento').delete().eq('id', recebimentoId);
  await admin.from('LancamentoFinanceiro').delete().eq('descricao', 'Recebimento de sessão').eq('conta', conta.id).eq('valor', 120);
  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: `consumirCredito` sem erro, uma `RecebimentoSessao` criada com `valor_aplicado: 120`.

- [ ] **Step 4: Excluir o arquivo antigo `web/lib/pagamento-sessao.js`**

Ainda não pode ser excluído neste ponto — `web/lib/actions/sessoes.js` (`marcarAtendimentoRealizado`) e `web/lib/actions/pagamentos.js` ainda importam `criarPagamentoSessao` dele. A remoção acontece no Task 12, depois que esses dois pontos migrarem para `criarRecebimento`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/recebimento.js && git commit -m "feat: adiciona lib/recebimento.js com suporte a recebimento em lote e credito"
```

---

## Task 9: Camada de dados — `lib/data/recebimentos.js`

**Files:**
- Create: `web/lib/data/recebimentos.js`

**Interfaces:**
- Consumes: `Sessao.valor` (Task 2), `Recebimento`/`RecebimentoSessao` (Task 3).
- Produces:
  - `listarSessoesReceptiveis(pacienteId)` → `Promise<Array<{id, data, horario, valor, valor_recebido, saldo_devedor}>>` (só sessões com saldo devedor > 0, não canceladas).
  - `calcularCreditoDisponivel(pacienteId)` → `Promise<{ total: number, recebimentos: Array<{id, data_recebimento, saldo}> }>` (só recebimentos com saldo > 0).

- [ ] **Step 1: Escrever o arquivo**

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarSessoesReceptiveis(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, valor, status, RecebimentoSessao(valor_aplicado)")
    .eq("paciente", pacienteId)
    .neq("status", "Cancelada")
    .order("data")
    .order("horario");

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return {
        id: s.id,
        data: s.data,
        horario: s.horario,
        valor: Number(s.valor),
        valor_recebido: valorRecebido,
        saldo_devedor: Number(s.valor) - valorRecebido,
      };
    })
    .filter((s) => s.saldo_devedor > 0);
}

export async function calcularCreditoDisponivel(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Recebimento")
    .select("id, data_recebimento, valor_total, RecebimentoSessao(valor_aplicado)")
    .eq("paciente", pacienteId);

  if (error) throw new Error(error.message);

  const recebimentos = normalizarIdsLista(data, ["id"])
    .map((r) => {
      const valorAlocado = (r.RecebimentoSessao ?? []).reduce((soma, rs) => soma + Number(rs.valor_aplicado), 0);
      return {
        id: r.id,
        data_recebimento: r.data_recebimento,
        saldo: Number(r.valor_total) - valorAlocado,
      };
    })
    .filter((r) => r.saldo > 0)
    .sort((a, b) => (a.data_recebimento < b.data_recebimento ? -1 : 1));

  return {
    total: recebimentos.reduce((soma, r) => soma + r.saldo, 0),
    recebimentos,
  };
}
```

- [ ] **Step 2: Verificar com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

const { criarRecebimento } = require('./lib/recebimento.js');
const { listarSessoesReceptiveis, calcularCreditoDisponivel } = require('./lib/data/recebimentos.js');

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Data Receb', valor_sessao: 100 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Data Receb', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { data: sessaoPaga } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 100, Realizado: true }).select('id').single();
  const { data: sessaoPendente } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-08', horario: '09:00', valor: 100, Realizado: false }).select('id').single();

  await criarRecebimento(admin, { pacienteId: paciente.id, responsavelFinanceiroId: resp.id, sessoes: [{ id: sessaoPaga.id, valor: 100 }], valorTotal: 100, contaId: conta.id, formaPagamento: 'Pix', dataRecebimento: '2026-09-01' });
  const { recebimentoId: creditoId } = await criarRecebimento(admin, { pacienteId: paciente.id, responsavelFinanceiroId: resp.id, sessoes: [], valorTotal: 50, contaId: conta.id, formaPagamento: 'Dinheiro', dataRecebimento: '2026-09-01' });

  // simular chamadas server-side com o client admin, sem passar por createClient()
  const supabaseOriginal = require('@/lib/supabase/server');
  const receptiveis = await (async () => {
    const { data } = await admin.from('Sessao').select('id, data, horario, valor, status, RecebimentoSessao(valor_aplicado)').eq('paciente', paciente.id).neq('status', 'Cancelada').order('data').order('horario');
    return data.map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return { id: s.id, saldo_devedor: Number(s.valor) - valorRecebido };
    }).filter((s) => s.saldo_devedor > 0);
  })();
  console.log('sessoes receptiveis (esperado so a pendente):', receptiveis.map((s) => s.id), '== [' + sessaoPendente.id + ']');

  const { data: recebimentosBrutos } = await admin.from('Recebimento').select('id, data_recebimento, valor_total, RecebimentoSessao(valor_aplicado)').eq('paciente', paciente.id);
  const creditoDisponivel = recebimentosBrutos.map((r) => ({ id: r.id, saldo: Number(r.valor_total) - (r.RecebimentoSessao ?? []).reduce((s, a) => s + Number(a.valor_aplicado), 0) })).filter((r) => r.saldo > 0);
  console.log('credito disponivel (esperado 1 recebimento com saldo 50):', creditoDisponivel);

  const { data: recebimentosParaLimpar } = await admin.from('Recebimento').select('id, lancamento').eq('paciente', paciente.id);
  await admin.from('RecebimentoSessao').delete().in('recebimento', recebimentosParaLimpar.map((r) => r.id));
  await admin.from('Recebimento').delete().in('id', recebimentosParaLimpar.map((r) => r.id));
  await admin.from('LancamentoFinanceiro').delete().in('id', recebimentosParaLimpar.map((r) => r.lancamento));
  await admin.from('Sessao').delete().in('id', [sessaoPaga.id, sessaoPendente.id]);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Nota: este script reimplementa a query inline (em vez de importar `listarSessoesReceptiveis`/`calcularCreditoDisponivel` diretamente) porque essas funções chamam `createClient()` de `@/lib/supabase/server`, que depende de `next/headers` — só funciona dentro de uma requisição Next.js real. A query reimplementada usa exatamente a mesma lógica (mesmo `select`, mesmo cálculo de soma) só trocando o client por um com service role, o suficiente pra validar a regra de negócio isoladamente.

Expected: sessões recebíveis retornam só a sessão pendente; crédito disponível mostra 1 recebimento com saldo 50.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/recebimentos.js && git commit -m "feat: adiciona leitura de sessoes receptiveis e credito disponivel"
```

---

## Task 10: Server Actions — `lib/actions/recebimentos.js` + atualizar `marcarAtendimentoRealizado`

**Files:**
- Create: `web/lib/actions/recebimentos.js`
- Modify: `web/lib/actions/sessoes.js`

**Interfaces:**
- Consumes: `criarRecebimento`/`consumirCredito` (Task 8), `calcularCreditoDisponivel` (Task 9).
- Produces:
  - `registrarRecebimentoIndividual(sessaoId, pacienteId, prevState, formData)` — recebe 1 sessão pelo valor cheio de `Sessao.valor`.
  - `registrarRecebimentoLote(pacienteId, prevState, formData)` — recebe N sessões marcadas (`formData.getAll("sessao_id")`) ou, se nenhuma marcada, um valor de crédito explícito (`formData.get("valor_credito")`).
  - `usarCreditoNaSessao(pacienteId, sessaoId, recebimentoId)` — consome um recebimento com saldo suficiente pra quitar uma sessão específica.
  - `marcarAtendimentoRealizado` (em `lib/actions/sessoes.js`) passa a chamar `criarRecebimento` em vez de `criarPagamentoSessao`.

- [ ] **Step 1: Escrever `web/lib/actions/recebimentos.js`**

```js
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarRecebimento, consumirCredito } from "@/lib/recebimento";
import { calcularCreditoDisponivel } from "@/lib/data/recebimentos";

export async function registrarRecebimentoIndividual(sessaoId, pacienteId, prevState, formData) {
  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("valor")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    return { error: "Sessão não encontrada." };
  }

  const { error } = await criarRecebimento(supabase, {
    pacienteId,
    responsavelFinanceiroId: Number(formData.get("responsavel_financeiro")),
    sessoes: [{ id: sessaoId, valor: Number(sessao.valor) }],
    valorTotal: Number(sessao.valor),
    contaId: Number(formData.get("conta")),
    formaPagamento: formData.get("forma_pagamento"),
    dataRecebimento: formData.get("data_recebimento"),
  });

  if (error) {
    return { error };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${pacienteId}`);
  redirect("/agenda");
}

export async function registrarRecebimentoLote(pacienteId, prevState, formData) {
  const supabase = await createClient();

  const sessaoIds = formData.getAll("sessao_id").map(Number);
  const responsavelFinanceiroId = Number(formData.get("responsavel_financeiro"));
  const contaId = Number(formData.get("conta"));
  const formaPagamento = formData.get("forma_pagamento");
  const dataRecebimento = formData.get("data_recebimento");

  let sessoes = [];
  let valorTotal;

  if (sessaoIds.length > 0) {
    const { data: sessoesBrutas, error: erroSessoes } = await supabase
      .from("Sessao")
      .select("id, valor")
      .in("id", sessaoIds);

    if (erroSessoes) {
      return { error: "Não foi possível carregar as sessões selecionadas." };
    }

    sessoes = sessoesBrutas.map((s) => ({ id: s.id, valor: Number(s.valor) }));
    valorTotal = sessoes.reduce((soma, s) => soma + s.valor, 0);
  } else {
    valorTotal = Number(formData.get("valor_credito"));
    if (!valorTotal || valorTotal <= 0) {
      return { error: "Informe o valor do crédito a receber." };
    }
  }

  const { error } = await criarRecebimento(supabase, {
    pacienteId,
    responsavelFinanceiroId,
    sessoes,
    valorTotal,
    contaId,
    formaPagamento,
    dataRecebimento,
  });

  if (error) {
    return { error };
  }

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${pacienteId}`);
  redirect(`/pacientes/${pacienteId}?aba=sessoes`);
}

export async function usarCreditoNaSessao(pacienteId, sessaoId, recebimentoId) {
  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("valor")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) {
    throw new Error("Sessão não encontrada.");
  }

  const credito = await calcularCreditoDisponivel(pacienteId);
  const recebimento = credito.recebimentos.find((r) => r.id === recebimentoId);

  if (!recebimento || recebimento.saldo < Number(sessao.valor)) {
    throw new Error("Crédito insuficiente para quitar esta sessão.");
  }

  const { error } = await consumirCredito(supabase, {
    recebimentoId,
    sessaoId,
    valorAplicado: Number(sessao.valor),
  });

  if (error) {
    throw new Error(error);
  }

  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/agenda");
}
```

- [ ] **Step 2: Atualizar `marcarAtendimentoRealizado` em `web/lib/actions/sessoes.js`**

Trocar o import `import { criarPagamentoSessao } from "@/lib/pagamento-sessao";` por `import { criarRecebimento } from "@/lib/recebimento";`, e substituir o corpo de `marcarAtendimentoRealizado`:

```js
export async function marcarAtendimentoRealizado(sessaoId, prevState, formData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("Sessao")
    .update({
      status: "Realizada",
      Realizado: true,
      anotacoes: formData.get("anotacoes") || null,
    })
    .eq("id", sessaoId);

  if (error) {
    return { error: "Não foi possível registrar o atendimento." };
  }

  if (formData.get("pagou") === "on") {
    const { data: sessaoAtual, error: erroSessaoAtual } = await supabase
      .from("Sessao")
      .select("paciente, valor")
      .eq("id", sessaoId)
      .single();

    if (erroSessaoAtual) {
      return { error: "Não foi possível carregar a sessão." };
    }

    const { error: erroRecebimento } = await criarRecebimento(supabase, {
      pacienteId: sessaoAtual.paciente,
      responsavelFinanceiroId: Number(formData.get("responsavel_financeiro")),
      sessoes: [{ id: sessaoId, valor: Number(sessaoAtual.valor) }],
      valorTotal: Number(sessaoAtual.valor),
      contaId: Number(formData.get("conta")),
      formaPagamento: formData.get("forma_pagamento"),
      dataRecebimento: formData.get("data_pagamento"),
    });

    if (erroRecebimento) {
      return { error: erroRecebimento };
    }
  }

  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/");
  redirect("/agenda?registrado=1");
}
```

- [ ] **Step 3: Adicionar o bloqueio de cancelamento de sessão com recebimento aplicado**

Em `web/lib/actions/sessoes.js`, substituir `cancelarSessao`:

```js
export async function cancelarSessao(sessaoId) {
  const supabase = await createClient();

  const { data: alocacoes, error: erroAlocacoes } = await supabase
    .from("RecebimentoSessao")
    .select("id")
    .eq("sessao", sessaoId);

  if (erroAlocacoes) {
    throw new Error(erroAlocacoes.message);
  }

  if (alocacoes.length > 0) {
    throw new Error("Esta sessão já tem recebimento aplicado. Desfaça a alocação no recebimento antes de cancelar.");
  }

  const { error } = await supabase
    .from("Sessao")
    .update({ status: "Cancelada" })
    .eq("id", sessaoId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  redirect("/agenda");
}
```

- [ ] **Step 4: Verificar o bloqueio de cancelamento com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Cancelar Sessao', valor_sessao: 100 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Cancelar Sessao', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 100, Realizado: true }).select('id').single();
  const { data: lancamento } = await admin.from('LancamentoFinanceiro').insert({ data: '2026-09-01', descricao: 'Teste', valor: 100, tipo: 'Receita', conta: conta.id }).select('id').single();
  const { data: recebimento } = await admin.from('Recebimento').insert({ paciente: paciente.id, responsavel_financeiro: resp.id, data_recebimento: '2026-09-01', valor_total: 100, forma_pagamento: 'Pix', conta: conta.id, lancamento: lancamento.id }).select('id').single();
  await admin.from('RecebimentoSessao').insert({ recebimento: recebimento.id, sessao: sessao.id, valor_aplicado: 100 });

  // reproduz a checagem de cancelarSessao sem passar pela Server Action (que precisa de next/headers)
  const { data: alocacoes } = await admin.from('RecebimentoSessao').select('id').eq('sessao', sessao.id);
  console.log('sessao com recebimento aplicado deveria bloquear cancelamento (esperado true):', alocacoes.length > 0);

  await admin.from('RecebimentoSessao').delete().eq('recebimento', recebimento.id);
  await admin.from('Recebimento').delete().eq('id', recebimento.id);
  await admin.from('LancamentoFinanceiro').delete().eq('id', lancamento.id);
  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: `alocacoes.length > 0` é `true`, confirmando que a condição usada em `cancelarSessao` detecta corretamente o caso a bloquear. O comportamento completo da Server Action (lançar erro e não cancelar) fica pra verificação E2E no Task 19.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/recebimentos.js web/lib/actions/sessoes.js && git commit -m "feat: actions de recebimento individual, em lote, credito e bloqueio de cancelamento"
```

---

## Task 11: `lib/data/financeiro.js` — nova regra de inadimplência

**Files:**
- Modify: `web/lib/data/financeiro.js`

**Interfaces:**
- Consumes: `Sessao.valor` (Task 2), `RecebimentoSessao` (Task 3).
- Produces: `listarInadimplentes()` passa a considerar quitação parcial/total via `RecebimentoSessao` em vez de existência de `PagamentoSessao`; `valor_devido` reflete o saldo devedor real (`Sessao.valor` menos o já recebido), não mais `Paciente.valor_sessao`. `calcularPrevisto` passa a somar `Sessao.valor`.

- [ ] **Step 1: Editar o arquivo**

Substituir o arquivo inteiro por:

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

// Soma de Sessao.valor das sessões marcadas/realizadas no período — é o
// valor "provisório" (sessões futuras de recorrência entram aqui até
// serem realizadas e viram um LancamentoFinanceiro de verdade).
export async function calcularPrevisto({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("valor")
    .or("status.neq.Cancelada,status.is.null")
    .gte("data", dataInicio)
    .lte("data", dataFim);

  if (error) throw new Error(error.message);

  return data.reduce((soma, s) => soma + Number(s.valor || 0), 0);
}

export async function resumoDoMes(mesReferencia) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_resumo_financeiro_mensal")
    .select("total_receita, total_despesa, saldo_mes")
    .eq("mes_referencia", mesReferencia)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? { total_receita: 0, total_despesa: 0, saldo_mes: 0 };
}

// Sessao realizada com soma de RecebimentoSessao.valor_aplicado menor que
// Sessao.valor (quitação parcial ou nenhuma) — substitui a antiga regra
// baseada em existência de PagamentoSessao.
export async function listarInadimplentes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, valor, Paciente!inner(id, nome), RecebimentoSessao(valor_aplicado)"
    )
    .eq("Realizado", true)
    .order("data");

  if (error) throw new Error(error.message);

  return data
    .map((s) => {
      const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
      return { ...s, saldo_devedor: Number(s.valor) - valorRecebido };
    })
    .filter((s) => s.saldo_devedor > 0)
    .map((s) =>
      normalizarIds(
        {
          sessao_id: s.id,
          data: s.data,
          paciente_id: s.Paciente.id,
          paciente_nome: s.Paciente.nome,
          valor_devido: s.saldo_devedor,
        },
        ["sessao_id", "paciente_id"]
      )
    );
}
```

Nota: os campos `paciente_dependente`/`responsavel_nome` (do modelo antigo de dependente, ver `docs/superpowers/specs/2026-08-11-documentos-dependente-responsavel-financeiro-design.md`) saem da lista de inadimplentes — o conceito de "quem paga por quem" agora vive em `ResponsavelFinanceiro`/`PacienteResponsavelFinanceiro` (Task 5), consultável separadamente pela tela de detalhe do paciente se necessário. Isso é uma simplificação deliberada: a lista de inadimplentes não precisa mais saber quem é o responsável, só quanto está em aberto.

- [ ] **Step 2: Atualizar `web/app/(app)/(gestao)/financeiro/page.js`**

Remover a exibição condicional de `i.paciente_dependente`/`i.responsavel_nome` que hoje aparece ao lado do nome do paciente na lista de inadimplentes (adicionada pelo plano de 2026-08-11) — substituir:

```jsx
                <Link href={`/pacientes/${i.paciente_id}`} className="font-semibold text-navy">
                  {i.paciente_nome}
                  {i.paciente_dependente && i.responsavel_nome && (
                    <span className="text-muted font-normal"> (dependente de {i.responsavel_nome})</span>
                  )}
                </Link>
```

por:

```jsx
                <Link href={`/pacientes/${i.paciente_id}`} className="font-semibold text-navy">
                  {i.paciente_nome}
                </Link>
```

- [ ] **Step 3: Verificar com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Inadimplente', valor_sessao: 100 }).select('id').single();
  const { data: resp } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Inadimplente', paciente_vinculado: paciente.id }).select('id').single();
  const { data: conta } = await admin.from('ContaFinanceira').select('id').limit(1).single();
  const { data: sessaoSemPagamento } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 100, Realizado: true }).select('id').single();
  const { data: sessaoQuitada } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-02', horario: '09:00', valor: 100, Realizado: true }).select('id').single();
  const { data: lancamento } = await admin.from('LancamentoFinanceiro').insert({ data: '2026-09-02', descricao: 'Teste', valor: 100, tipo: 'Receita', conta: conta.id }).select('id').single();
  const { data: recebimento } = await admin.from('Recebimento').insert({ paciente: paciente.id, responsavel_financeiro: resp.id, data_recebimento: '2026-09-02', valor_total: 100, forma_pagamento: 'Pix', conta: conta.id, lancamento: lancamento.id }).select('id').single();
  await admin.from('RecebimentoSessao').insert({ recebimento: recebimento.id, sessao: sessaoQuitada.id, valor_aplicado: 100 });

  const { data } = await admin
    .from('Sessao')
    .select('id, valor, RecebimentoSessao(valor_aplicado)')
    .eq('Realizado', true)
    .in('id', [sessaoSemPagamento.id, sessaoQuitada.id]);
  const inadimplentes = data
    .map((s) => ({ id: s.id, saldo: Number(s.valor) - (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0) }))
    .filter((s) => s.saldo > 0);
  console.log('inadimplentes (esperado so sessaoSemPagamento, id ' + sessaoSemPagamento.id + '):', inadimplentes);

  await admin.from('RecebimentoSessao').delete().eq('recebimento', recebimento.id);
  await admin.from('Recebimento').delete().eq('id', recebimento.id);
  await admin.from('LancamentoFinanceiro').delete().eq('id', lancamento.id);
  await admin.from('Sessao').delete().in('id', [sessaoSemPagamento.id, sessaoQuitada.id]);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', resp.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: só `sessaoSemPagamento` aparece como inadimplente, com saldo 100.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/financeiro.js "web/app/(app)/(gestao)/financeiro/page.js" && git commit -m "feat: inadimplencia passa a considerar saldo devedor via RecebimentoSessao"
```

---

## Task 12: UI — recebimento individual (renomeia rota `/pagamento` → `/receber`) e atualiza registro de atendimento

**Files:**
- Create: `web/app/(app)/(gestao)/sessoes/[id]/receber/page.js`
- Create: `web/components/RecebimentoIndividualForm.js`
- Delete: `web/app/(app)/(gestao)/sessoes/[id]/pagamento/page.js`
- Delete: `web/components/PagamentoSessaoForm.js`
- Delete: `web/lib/actions/pagamentos.js`
- Delete: `web/lib/pagamento-sessao.js`
- Modify: `web/app/(app)/(gestao)/agenda/page.js`
- Modify: `web/components/RegistroAtendimentoForm.js`
- Modify: `web/app/(app)/(gestao)/sessoes/[id]/registrar/page.js`

**Interfaces:**
- Consumes: `registrarRecebimentoIndividual` (Task 10), `listarResponsaveisDoPaciente` (Task 5), `buscarSessao` com `valor` (Task 7).
- Produces: nenhuma interface nova consumida por outras tasks — ponta de UI.

- [ ] **Step 1: Criar `web/components/RecebimentoIndividualForm.js`**

```js
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function RecebimentoIndividualForm({ action, valor, contas, responsaveis, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <p className="text-sm font-semibold text-navy">Valor da sessão</p>
        <p className="text-lg font-bold text-navy">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)}</p>
      </div>

      <div>
        <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
          Responsável financeiro
        </label>
        <select id="responsavel_financeiro" name="responsavel_financeiro" required defaultValue={responsaveis.length === 1 ? responsaveis[0].id : ""} className="field">
          <option value="" disabled>
            Selecione
          </option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
              {r.eh_proprio ? " (o próprio paciente)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="data_recebimento" className="block text-sm font-semibold text-navy">
          Data do recebimento
        </label>
        <input id="data_recebimento" name="data_recebimento" type="date" required defaultValue={dataInicial} className="field" />
      </div>

      <div>
        <label htmlFor="conta" className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id="conta" name="conta" required className="field">
          <option value="" disabled>
            Selecione
          </option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="forma_pagamento" className="block text-sm font-semibold text-navy">
          Forma de pagamento
        </label>
        <select id="forma_pagamento" name="forma_pagamento" required className="field">
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão">Cartão</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Confirmando..." : "Confirmar recebimento"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Criar `web/app/(app)/(gestao)/sessoes/[id]/receber/page.js`**

```js
import RecebimentoIndividualForm from "@/components/RecebimentoIndividualForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { registrarRecebimentoIndividual } from "@/lib/actions/recebimentos";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaReceberSessao({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const sessao = await buscarSessao(sessaoId);
  const [contas, responsaveis] = await Promise.all([
    listarContas(),
    listarResponsaveisDoPaciente(sessao.paciente_id),
  ]);
  const acaoComIds = registrarRecebimentoIndividual.bind(null, sessaoId, sessao.paciente_id);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Receber</h1>
      <div className="text-sm text-muted">
        <p className="font-semibold text-navy">{sessao.paciente_nome}</p>
        <p>
          Sessão de {sessao.data} {sessao.horario}
        </p>
      </div>
      <RecebimentoIndividualForm
        action={acaoComIds}
        valor={sessao.valor}
        contas={contas}
        responsaveis={responsaveis}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
```

- [ ] **Step 3: Apagar a rota e o componente antigos de pagamento**

```bash
rm "c:\Users\Administrador\Desktop\Projetos\Psicologia\web\app\(app)\(gestao)\sessoes\[id]\pagamento\page.js"
rmdir "c:\Users\Administrador\Desktop\Projetos\Psicologia\web\app\(app)\(gestao)\sessoes\[id]\pagamento"
rm "c:\Users\Administrador\Desktop\Projetos\Psicologia\web\components\PagamentoSessaoForm.js"
```

- [ ] **Step 4: Atualizar o link na Agenda (`web/app/(app)/(gestao)/agenda/page.js`)**

Substituir (linhas 104-108 hoje):

```jsx
                {s.realizado && !s.pago && (
                  <Link href={`/sessoes/${s.id}/pagamento`} className="link">
                    Registrar Pagamento
                  </Link>
                )}
```

por:

```jsx
                {s.realizado && !s.pago && (
                  <Link href={`/sessoes/${s.id}/receber`} className="link">
                    Receber
                  </Link>
                )}
```

- [ ] **Step 5: Adicionar seleção de responsável e remover valor editável em `RegistroAtendimentoForm.js`**

Substituir o arquivo inteiro por:

```js
"use client";

import { useActionState, useState } from "react";

const estadoInicial = {};

export default function RegistroAtendimentoForm({ action, contas, responsaveis, valor, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [pagou, setPagou] = useState(false);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="anotacoes" className="block text-sm font-semibold text-navy">
          Anotações
        </label>
        <textarea id="anotacoes" name="anotacoes" rows={4} className="field" />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="pagou"
          name="pagou"
          type="checkbox"
          checked={pagou}
          onChange={(e) => setPagou(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="pagou" className="text-sm font-semibold text-navy">
          Paciente pagou nesta sessão?
        </label>
      </div>

      {pagou && (
        <div className="space-y-4 border-l-2 border-slate-200 pl-4">
          <p className="text-sm text-muted">
            Valor: <span className="font-semibold text-navy">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)}</span>
          </p>

          <div>
            <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
              Responsável financeiro
            </label>
            <select id="responsavel_financeiro" name="responsavel_financeiro" required={pagou} defaultValue={responsaveis.length === 1 ? responsaveis[0].id : ""} className="field">
              <option value="" disabled>
                Selecione
              </option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                  {r.eh_proprio ? " (o próprio paciente)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="data_pagamento" className="block text-sm font-semibold text-navy">
              Data do pagamento
            </label>
            <input id="data_pagamento" name="data_pagamento" type="date" required={pagou} defaultValue={dataInicial} className="field" />
          </div>

          <div>
            <label htmlFor="conta" className="block text-sm font-semibold text-navy">
              Conta
            </label>
            <select id="conta" name="conta" required={pagou} className="field">
              <option value="" disabled>
                Selecione
              </option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="forma_pagamento" className="block text-sm font-semibold text-navy">
              Forma de pagamento
            </label>
            <select id="forma_pagamento" name="forma_pagamento" required={pagou} className="field">
              <option value="Dinheiro">Dinheiro</option>
              <option value="Pix">Pix</option>
              <option value="Cartão">Cartão</option>
            </select>
          </div>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Marcar como realizado"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Atualizar `web/app/(app)/(gestao)/sessoes/[id]/registrar/page.js`**

```js
import RegistroAtendimentoForm from "@/components/RegistroAtendimentoForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { marcarAtendimentoRealizado } from "@/lib/actions/sessoes";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaRegistrarAtendimento({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);
  const sessao = await buscarSessao(sessaoId);
  const [contas, responsaveis] = await Promise.all([
    listarContas(),
    listarResponsaveisDoPaciente(sessao.paciente_id),
  ]);
  const acaoComId = marcarAtendimentoRealizado.bind(null, sessaoId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Registrar Atendimento</h1>
      <div className="text-sm text-muted">
        <p className="font-semibold text-navy">{sessao.paciente_nome}</p>
        <p>
          {sessao.data} {sessao.horario}
        </p>
      </div>
      <RegistroAtendimentoForm
        action={acaoComId}
        contas={contas}
        responsaveis={responsaveis}
        valor={sessao.valor}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
```

- [ ] **Step 7: Excluir o código obsoleto de pagamento**

Agora que nada mais importa `criarPagamentoSessao` (Task 10 já trocou `marcarAtendimentoRealizado`, e a rota `/pagamento` acabou de ser removida):

```bash
rm "c:\Users\Administrador\Desktop\Projetos\Psicologia\web\lib\actions\pagamentos.js"
rm "c:\Users\Administrador\Desktop\Projetos\Psicologia\web\lib\pagamento-sessao.js"
```

Antes de remover, confirmar que não sobrou nenhuma referência:

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && grep -r "pagamento-sessao\|actions/pagamentos\|criarPagamentoSessao\|registrarPagamentoSessao" web/ --include="*.js"
```

Expected: nenhum resultado (comando não imprime nada).

- [ ] **Step 8: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add -A web/app web/components web/lib && git commit -m "feat: renomeia fluxo de pagamento individual para recebimento e remove codigo obsoleto"
```

---

## Task 13: UI — aba "Sessões" da Ficha do Paciente com status e ação "Receber"

**Files:**
- Modify: `web/lib/data/pacientes.js`
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js`

**Interfaces:**
- Consumes: `Sessao.valor`, `RecebimentoSessao` (Tasks 2, 3).
- Produces: `listarSessoesDoPaciente(pacienteId)` retorna também `valor`, `valor_recebido`, `saldo_devedor` por sessão.

- [ ] **Step 1: Editar `listarSessoesDoPaciente` em `web/lib/data/pacientes.js`**

Substituir a função (linhas 122-133 hoje):

```js
export async function listarSessoesDoPaciente(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, status, tipo_sessao, valor, RecebimentoSessao(valor_aplicado)")
    .eq("paciente", pacienteId)
    .order("data", { ascending: false })
    .order("horario", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((s) => {
    const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    return {
      id: s.id,
      data: s.data,
      horario: s.horario,
      status: s.status,
      tipo_sessao: s.tipo_sessao,
      valor: Number(s.valor),
      valor_recebido: valorRecebido,
      saldo_devedor: Number(s.valor) - valorRecebido,
    };
  });
}
```

- [ ] **Step 2: Atualizar a aba "Sessões" em `web/app/(app)/(gestao)/pacientes/[id]/page.js`**

Adicionar o import `import { formatarMoeda } from "@/lib/formatar-moeda";` (já importado hoje, ver linha 10). Substituir o bloco `{aba === "sessoes" && (...)}` (linhas 194-216 hoje) por:

```jsx
      {aba === "sessoes" && (
        <div>
          {sessoes.length === 0 ? (
            <p className="empty-state">Nenhuma sessão registrada.</p>
          ) : (
            <div className="space-y-3">
              {sessoes.map((s) => (
                <div
                  key={s.id}
                  className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    {s.data} ({diaDaSemanaAbreviado(s.data)}) {s.horario?.slice(0, 5)}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted">{s.tipo_sessao}</span>
                    <span>{s.status ?? "Marcada"}</span>
                    <span className="text-muted">{formatarMoeda(s.valor)}</span>
                    {s.saldo_devedor > 0 ? (
                      s.status !== "Cancelada" && (
                        <Link href={`/sessoes/${s.id}/receber`} className="link">
                          Receber
                        </Link>
                      )
                    ) : (
                      <span className="text-green-700 font-semibold">Recebido</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verificar `listarSessoesDoPaciente` com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Aba Sessoes', valor_sessao: 100 }).select('id').single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: paciente.id, data: '2026-09-01', horario: '09:00', valor: 100, Realizado: false }).select('id').single();

  const { data } = await admin.from('Sessao').select('id, valor, RecebimentoSessao(valor_aplicado)').eq('paciente', paciente.id);
  const mapeado = data.map((s) => {
    const valorRecebido = (s.RecebimentoSessao ?? []).reduce((soma, r) => soma + Number(r.valor_aplicado), 0);
    return { id: s.id, valor: Number(s.valor), saldo_devedor: Number(s.valor) - valorRecebido };
  });
  console.log('sessao sem recebimento (esperado saldo_devedor 100):', mapeado);

  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: `saldo_devedor: 100`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/pacientes.js "web/app/(app)/(gestao)/pacientes/[id]/page.js" && git commit -m "feat: aba sessoes da ficha do paciente mostra valor, status e acao de receber"
```

---

## Task 14: UI — recebimento em lote (`/pacientes/[id]/receber`)

**Files:**
- Create: `web/app/(app)/(gestao)/pacientes/[id]/receber/page.js`
- Create: `web/components/RecebimentoLoteForm.js`
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js`

**Interfaces:**
- Consumes: `listarSessoesReceptiveis` (Task 9), `registrarRecebimentoLote` (Task 10), `listarResponsaveisDoPaciente` (Task 5), `listarContas`.
- Produces: nenhuma interface nova consumida por outras tasks.

- [ ] **Step 1: Criar `web/components/RecebimentoLoteForm.js`**

```js
"use client";

import { useActionState, useMemo, useState } from "react";

const estadoInicial = {};

export default function RecebimentoLoteForm({ action, sessoes, contas, responsaveis, dataInicial }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [selecionadas, setSelecionadas] = useState([]);

  const total = useMemo(
    () => sessoes.filter((s) => selecionadas.includes(s.id)).reduce((soma, s) => soma + s.saldo_devedor, 0),
    [sessoes, selecionadas]
  );

  function alternarSessao(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((s) => s !== id) : [...atual, id]));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="card divide-y divide-border">
        {sessoes.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nenhuma sessão em aberto — só é possível registrar crédito antecipado.</p>
        ) : (
          sessoes.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="sessao_id"
                  value={s.id}
                  checked={selecionadas.includes(s.id)}
                  onChange={() => alternarSessao(s.id)}
                  className="h-4 w-4"
                />
                {s.data} {s.horario?.slice(0, 5)}
              </span>
              <span className="font-semibold text-navy">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.saldo_devedor)}
              </span>
            </label>
          ))
        )}
      </div>

      {selecionadas.length > 0 ? (
        <p className="text-sm font-semibold text-navy">
          Total selecionado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
        </p>
      ) : (
        <div>
          <label htmlFor="valor_credito" className="block text-sm font-semibold text-navy">
            Nenhuma sessão selecionada — valor a receber como crédito antecipado
          </label>
          <input id="valor_credito" name="valor_credito" type="number" step="0.01" min="0.01" className="field" />
        </div>
      )}

      <div>
        <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
          Responsável financeiro
        </label>
        <select id="responsavel_financeiro" name="responsavel_financeiro" required defaultValue={responsaveis.length === 1 ? responsaveis[0].id : ""} className="field">
          <option value="" disabled>
            Selecione
          </option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
              {r.eh_proprio ? " (o próprio paciente)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="data_recebimento" className="block text-sm font-semibold text-navy">
          Data do recebimento
        </label>
        <input id="data_recebimento" name="data_recebimento" type="date" required defaultValue={dataInicial} className="field" />
      </div>

      <div>
        <label htmlFor="conta" className="block text-sm font-semibold text-navy">
          Conta
        </label>
        <select id="conta" name="conta" required className="field">
          <option value="" disabled>
            Selecione
          </option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="forma_pagamento" className="block text-sm font-semibold text-navy">
          Forma de pagamento
        </label>
        <select id="forma_pagamento" name="forma_pagamento" required className="field">
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão">Cartão</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Confirmando..." : "Confirmar recebimento"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Criar `web/app/(app)/(gestao)/pacientes/[id]/receber/page.js`**

```js
import RecebimentoLoteForm from "@/components/RecebimentoLoteForm";
import { buscarPaciente } from "@/lib/data/pacientes";
import { listarSessoesReceptiveis } from "@/lib/data/recebimentos";
import { listarContas } from "@/lib/data/contas";
import { listarResponsaveisDoPaciente } from "@/lib/data/responsaveis-financeiros";
import { registrarRecebimentoLote } from "@/lib/actions/recebimentos";
import { hojeISO } from "@/lib/periodo-agenda";

export default async function PaginaReceberSessoesPaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, sessoes, contas, responsaveis] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesReceptiveis(pacienteId),
    listarContas(),
    listarResponsaveisDoPaciente(pacienteId),
  ]);
  const acaoComId = registrarRecebimentoLote.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Receber sessões — {paciente.nome}</h1>
      <RecebimentoLoteForm
        action={acaoComId}
        sessoes={sessoes}
        contas={contas}
        responsaveis={responsaveis}
        dataInicial={hojeISO()}
      />
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o link "Receber sessões" na Ficha do Paciente**

Em `web/app/(app)/(gestao)/pacientes/[id]/page.js`, no bloco de links do topo (junto de "Nova Sessão", "Gerar Recibo", "Editar"), adicionar:

```jsx
          <Link href={`/pacientes/${pacienteId}/receber`} className="link">
            Receber Sessões
          </Link>
```

logo após o link "Nova Sessão".

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/app "web/components/RecebimentoLoteForm.js" && git commit -m "feat: adiciona recebimento em lote e credito antecipado na ficha do paciente"
```

---

## Task 15: UI — crédito disponível e "usar crédito" na Ficha do Paciente

**Files:**
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js`
- Create: `web/components/UsarCreditoBotao.js`

**Interfaces:**
- Consumes: `calcularCreditoDisponivel` (Task 9), `usarCreditoNaSessao` (Task 10).
- Produces: nenhuma interface nova consumida por outras tasks.

- [ ] **Step 1: Criar `web/components/UsarCreditoBotao.js`**

Componente client separado porque precisa de `useState` pro estado de carregando/erro ao chamar uma Server Action fora de um `<form>` (`usarCreditoNaSessao` não recebe `FormData`, é chamada direto).

```js
"use client";

import { useState, useTransition } from "react";

export default function UsarCreditoBotao({ pacienteId, sessaoId, recebimentoId, valor, onUsarCredito }) {
  const [erro, setErro] = useState(null);
  const [pending, startTransition] = useTransition();

  function aoClicar() {
    setErro(null);
    startTransition(async () => {
      try {
        await onUsarCredito(pacienteId, sessaoId, recebimentoId);
      } catch (e) {
        setErro(e.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={aoClicar} disabled={pending} className="link disabled:opacity-50">
        {pending ? "Usando crédito..." : `Usar crédito (${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)} disponível)`}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Editar `web/app/(app)/(gestao)/pacientes/[id]/page.js`**

Importar `calcularCreditoDisponivel`, `usarCreditoNaSessao` e `UsarCreditoBotao`; buscar o crédito junto com os outros dados; mostrar o banner e o botão por sessão.

No topo do arquivo, adicionar aos imports:

```js
import { calcularCreditoDisponivel } from "@/lib/data/recebimentos";
import { usarCreditoNaSessao } from "@/lib/actions/recebimentos";
import { formatarMoeda } from "@/lib/formatar-moeda";
import UsarCreditoBotao from "@/components/UsarCreditoBotao";
```

No `Promise.all` que busca os dados da página, adicionar `calcularCreditoDisponivel(pacienteId)`:

```js
  const [paciente, sessoes, anamnese, followups, propostaAtiva, credito] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesDoPaciente(pacienteId),
    buscarAnamnese(pacienteId),
    listarFollowupsAnamnese(pacienteId),
    buscarPropostaAtiva(pacienteId),
    calcularCreditoDisponivel(pacienteId),
  ]);
```

Dentro do bloco `{aba === "sessoes" && (...)}`, antes da lista de sessões, adicionar o banner de crédito:

```jsx
      {aba === "sessoes" && (
        <div className="space-y-4">
          {credito.total > 0 && (
            <div className="card border border-green-200 bg-green-50 p-4 text-sm">
              <p className="text-navy font-semibold">Crédito disponível: {formatarMoeda(credito.total)}</p>
            </div>
          )}
          {sessoes.length === 0 ? (
```

(fechar a nova `<div className="space-y-4">` extra no final do bloco, antes do `</div>` que hoje fecha o `{aba === "sessoes" && (...)}`).

No `<div className="flex flex-wrap items-center gap-3">` de cada linha de sessão (dentro do `.map`), adicionar o botão de crédito ao lado do link "Receber", só quando existir algum recebimento com saldo suficiente pra cobrir aquela sessão:

```jsx
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted">{s.tipo_sessao}</span>
                    <span>{s.status ?? "Marcada"}</span>
                    <span className="text-muted">{formatarMoeda(s.valor)}</span>
                    {s.saldo_devedor > 0 ? (
                      s.status !== "Cancelada" && (
                        <>
                          <Link href={`/sessoes/${s.id}/receber`} className="link">
                            Receber
                          </Link>
                          {(() => {
                            const recebimentoSuficiente = credito.recebimentos.find((r) => r.saldo >= s.saldo_devedor);
                            return (
                              recebimentoSuficiente && (
                                <UsarCreditoBotao
                                  pacienteId={pacienteId}
                                  sessaoId={s.id}
                                  recebimentoId={recebimentoSuficiente.id}
                                  valor={recebimentoSuficiente.saldo}
                                  onUsarCredito={usarCreditoNaSessao}
                                />
                              )
                            );
                          })()}
                        </>
                      )
                    ) : (
                      <span className="text-green-700 font-semibold">Recebido</span>
                    )}
                  </div>
```

Nota: `onUsarCredito={usarCreditoNaSessao}` passa a Server Action como prop de um Server Component pra um Client Component — o Next.js já suporta isso nativamente (a função é serializada como referência de Server Action), é o mesmo mecanismo usado pelos `action={...}` do `useActionState` em toda a base de código.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add "web/app/(app)/(gestao)/pacientes/[id]/page.js" web/components/UsarCreditoBotao.js && git commit -m "feat: mostra credito disponivel e permite usar credito para quitar sessao"
```

---

## Task 16: UI — tela "Responsáveis Financeiros" (lista, relatório, criar) e sub-seção na Ficha do Paciente

**Files:**
- Create: `web/app/(app)/(gestao)/responsaveis-financeiros/page.js`
- Create: `web/app/(app)/(gestao)/responsaveis-financeiros/novo/page.js`
- Create: `web/components/ResponsavelFinanceiroForm.js`
- Create: `web/components/ResponsaveisFinanceirosPaciente.js`
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js`

**Interfaces:**
- Consumes: `listarResponsaveisFinanceiros`, `listarResponsaveisParaVincular`, `listarResponsaveisDoPaciente` (Task 5), `criarResponsavelFinanceiro`, `criarEVincularResponsavel`, `vincularResponsavelExistente`, `desvincularResponsavel` (Task 6).
- Produces: nenhuma interface nova consumida por outras tasks.

- [ ] **Step 1: Criar `web/components/ResponsavelFinanceiroForm.js`**

```js
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function ResponsavelFinanceiroForm({ action, pacientes = [] }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required className="field" />
      </div>

      <div>
        <label htmlFor="cpf_cnpj" className="block text-sm font-semibold text-navy">
          CPF/CNPJ (opcional)
        </label>
        <input id="cpf_cnpj" name="cpf_cnpj" type="text" className="field" />
      </div>

      <div>
        <label htmlFor="telefone" className="block text-sm font-semibold text-navy">
          Telefone (opcional)
        </label>
        <input id="telefone" name="telefone" type="text" className="field" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-navy">
          E-mail (opcional)
        </label>
        <input id="email" name="email" type="email" className="field" />
      </div>

      {pacientes.length > 0 && (
        <div>
          <label htmlFor="paciente_vinculado" className="block text-sm font-semibold text-navy">
            Este responsável também é um paciente cadastrado? (opcional)
          </label>
          <select id="paciente_vinculado" name="paciente_vinculado" defaultValue="" className="field">
            <option value="">Não, é um responsável avulso</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Responsável salvo com sucesso.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Criar `web/app/(app)/(gestao)/responsaveis-financeiros/page.js`**

```js
import Link from "next/link";
import { listarResponsaveisFinanceiros } from "@/lib/data/responsaveis-financeiros";

export default async function PaginaResponsaveisFinanceiros() {
  const responsaveis = await listarResponsaveisFinanceiros();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Responsáveis Financeiros</h1>
        <Link href="/responsaveis-financeiros/novo" className="btn-primary">
          Novo Responsável
        </Link>
      </div>

      {responsaveis.length === 0 ? (
        <p className="empty-state">Nenhum responsável financeiro cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {responsaveis.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-navy">{r.nome}</p>
                <p className="text-muted">{r.telefone || r.email || "—"}</p>
              </div>
              <span className={`font-semibold ${r.qtd_pacientes > 1 ? "text-primary" : "text-muted"}`}>
                {r.qtd_pacientes} paciente(s) vinculado(s)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Criar `web/app/(app)/(gestao)/responsaveis-financeiros/novo/page.js`**

```js
import ResponsavelFinanceiroForm from "@/components/ResponsavelFinanceiroForm";
import { criarResponsavelFinanceiro } from "@/lib/actions/responsaveis-financeiros";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";

export default async function PaginaNovoResponsavelFinanceiro() {
  const pacientes = await listarPacientesParaSelect();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Responsável Financeiro</h1>
      <ResponsavelFinanceiroForm action={criarResponsavelFinanceiro} pacientes={pacientes} />
    </div>
  );
}
```

- [ ] **Step 4: Criar `web/components/ResponsaveisFinanceirosPaciente.js`**

```js
"use client";

import { useActionState, useState } from "react";

const estadoInicial = {};

export default function ResponsaveisFinanceirosPaciente({
  responsaveis,
  paraVincular,
  vincularExistenteAction,
  criarEVincularAction,
  onDesvincular,
}) {
  const [stateVincular, formActionVincular, pendingVincular] = useActionState(vincularExistenteAction, estadoInicial);
  const [stateCriar, formActionCriar, pendingCriar] = useActionState(criarEVincularAction, estadoInicial);
  const [mostrarNovo, setMostrarNovo] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {responsaveis.map((r) => (
          <div key={r.id} className="card flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {r.nome}
              {r.eh_proprio && <span className="text-muted"> (o próprio paciente)</span>}
            </span>
            {!r.eh_proprio && (
              <form action={onDesvincular.bind(null, r.id)}>
                <button type="submit" className="link text-red-600">
                  Desvincular
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {paraVincular.length > 0 && (
        <form action={formActionVincular} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="responsavel_id" className="block text-sm font-semibold text-navy">
              Vincular responsável existente
            </label>
            <select id="responsavel_id" name="responsavel_id" required className="field">
              <option value="" disabled selected>
                Selecione
              </option>
              {paraVincular.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pendingVincular} className="btn-outline disabled:opacity-50">
            {pendingVincular ? "Vinculando..." : "Vincular"}
          </button>
          {stateVincular?.error && <p className="w-full text-sm text-red-600">{stateVincular.error}</p>}
        </form>
      )}

      {!mostrarNovo ? (
        <button type="button" onClick={() => setMostrarNovo(true)} className="link">
          + Criar novo responsável financeiro
        </button>
      ) : (
        <form action={formActionCriar} className="card space-y-3 p-4">
          <div>
            <label htmlFor="novo_nome" className="block text-sm font-semibold text-navy">
              Nome
            </label>
            <input id="novo_nome" name="nome" type="text" required className="field" />
          </div>
          <div>
            <label htmlFor="novo_cpf_cnpj" className="block text-sm font-semibold text-navy">
              CPF/CNPJ (opcional)
            </label>
            <input id="novo_cpf_cnpj" name="cpf_cnpj" type="text" className="field" />
          </div>
          <div>
            <label htmlFor="novo_telefone" className="block text-sm font-semibold text-navy">
              Telefone (opcional)
            </label>
            <input id="novo_telefone" name="telefone" type="text" className="field" />
          </div>
          <div>
            <label htmlFor="novo_email" className="block text-sm font-semibold text-navy">
              E-mail (opcional)
            </label>
            <input id="novo_email" name="email" type="email" className="field" />
          </div>
          {stateCriar?.error && <p className="text-sm text-red-600">{stateCriar.error}</p>}
          <button type="submit" disabled={pendingCriar} className="btn-primary disabled:opacity-50">
            {pendingCriar ? "Salvando..." : "Criar e vincular"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Adicionar a sub-seção na Ficha do Paciente**

Em `web/app/(app)/(gestao)/pacientes/[id]/page.js`, importar as novas dependências:

```js
import { listarResponsaveisDoPaciente, listarResponsaveisParaVincular } from "@/lib/data/responsaveis-financeiros";
import { vincularResponsavelExistente, criarEVincularResponsavel, desvincularResponsavel } from "@/lib/actions/responsaveis-financeiros";
import ResponsaveisFinanceirosPaciente from "@/components/ResponsaveisFinanceirosPaciente";
```

Adicionar `listarResponsaveisDoPaciente(pacienteId)` e `listarResponsaveisParaVincular(pacienteId)` ao `Promise.all` de busca de dados da página, e criar as actions já vinculadas ao paciente:

```js
  const [paciente, sessoes, anamnese, followups, propostaAtiva, credito, responsaveis, paraVincular] = await Promise.all([
    buscarPaciente(pacienteId),
    listarSessoesDoPaciente(pacienteId),
    buscarAnamnese(pacienteId),
    listarFollowupsAnamnese(pacienteId),
    buscarPropostaAtiva(pacienteId),
    calcularCreditoDisponivel(pacienteId),
    listarResponsaveisDoPaciente(pacienteId),
    listarResponsaveisParaVincular(pacienteId),
  ]);
  const vincularAcaoComId = vincularResponsavelExistente.bind(null, pacienteId);
  const criarEVincularAcaoComId = criarEVincularResponsavel.bind(null, pacienteId);
  const desvincularAcaoComId = desvincularResponsavel.bind(null, pacienteId);
```

No bloco `{aba === "dados" && (...)}`, logo após o `<GerarLinkCadastroBotao pacienteId={pacienteId} />` no final, adicionar:

```jsx
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-navy">Responsáveis Financeiros</h2>
            <ResponsaveisFinanceirosPaciente
              responsaveis={responsaveis}
              paraVincular={paraVincular}
              vincularExistenteAction={vincularAcaoComId}
              criarEVincularAction={criarEVincularAcaoComId}
              onDesvincular={desvincularAcaoComId}
            />
          </div>
```

- [ ] **Step 6: Verificar `listarResponsaveisFinanceiros` (relatório) com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: mae } = await admin.from('Paciente').insert({ nome: 'Teste Relatorio Mae', valor_sessao: 100 }).select('id').single();
  const { data: respMae } = await admin.from('ResponsavelFinanceiro').insert({ nome: 'Teste Relatorio Mae', paciente_vinculado: mae.id }).select('id').single();
  const { data: filho1 } = await admin.from('Paciente').insert({ nome: 'Teste Relatorio Filho1', valor_sessao: 100 }).select('id').single();
  const { data: filho2 } = await admin.from('Paciente').insert({ nome: 'Teste Relatorio Filho2', valor_sessao: 100 }).select('id').single();
  await admin.from('PacienteResponsavelFinanceiro').insert([
    { paciente: mae.id, responsavel: respMae.id },
    { paciente: filho1.id, responsavel: respMae.id },
    { paciente: filho2.id, responsavel: respMae.id },
  ]);

  const { data } = await admin.from('ResponsavelFinanceiro').select('id, nome, PacienteResponsavelFinanceiro(paciente)').eq('id', respMae.id).single();
  console.log('qtd_pacientes da mae (esperado 3):', data.PacienteResponsavelFinanceiro.length);

  await admin.from('PacienteResponsavelFinanceiro').delete().eq('responsavel', respMae.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', respMae.id);
  await admin.from('Paciente').delete().in('id', [mae.id, filho1.id, filho2.id]);
  console.log('cleanup done');
})();
"
```

Expected: `qtd_pacientes` da mãe = 3 (ela mesma + 2 filhos).

- [ ] **Step 7: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/app/\(app\)/\(gestao\)/responsaveis-financeiros web/components/ResponsavelFinanceiroForm.js web/components/ResponsaveisFinanceirosPaciente.js "web/app/(app)/(gestao)/pacientes/[id]/page.js" && git commit -m "feat: adiciona tela de responsaveis financeiros e vinculo na ficha do paciente"
```

---

## Task 17: Remover UI antiga de dependente e provisionar responsável próprio na criação de paciente

O modelo antigo (`Paciente.dependente` + checkbox no formulário) é substituído pela sub-seção "Responsáveis Financeiros" da Ficha do Paciente (Task 16). Se o checkbox continuasse ativo, o formulário de paciente escreveria `dependente`/`responsavel_financeiro` sem nunca criar o vínculo `PacienteResponsavelFinanceiro` correspondente, divergindo do novo modelo. Além disso, todo paciente novo precisa do seu `ResponsavelFinanceiro` "próprio" (regra do spec), o que hoje só acontece via a migration de backfill (Task 4) — que não cobre pacientes criados depois dela.

**Files:**
- Modify: `web/components/PacienteForm.js`
- Modify: `web/app/(app)/(gestao)/pacientes/novo/page.js`
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/editar/page.js`
- Modify: `web/lib/actions/pacientes.js`

**Interfaces:**
- Consumes: `ResponsavelFinanceiro`/`PacienteResponsavelFinanceiro` (Task 1).
- Produces: `criarPaciente` passa a provisionar automaticamente o `ResponsavelFinanceiro` próprio e o vínculo `PacienteResponsavelFinanceiro` de todo paciente novo. `dadosDoFormulario` para de ler/gravar `dependente`/`responsavel_financeiro`.

- [ ] **Step 1: Remover o fieldset de dependente em `web/components/PacienteForm.js`**

Remover a linha 10 (`const [dependente, setDependente] = useState(Boolean(paciente?.dependente));`) e o parâmetro `pacientes = []` da assinatura da função (linha 7), deixando:

```js
export default function PacienteForm({ action, paciente, pacotes, consultorios }) {
```

Remover o `fieldset` inteiro de "Responsável financeiro" (linhas 225-264 hoje):

```jsx
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Responsável financeiro</legend>
        <div className="flex items-center gap-2">
          <input
            id="dependente"
            name="dependente"
            type="checkbox"
            checked={dependente}
            onChange={(e) => setDependente(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="dependente" className="text-sm font-semibold text-navy">
            Este paciente é dependente de outra pessoa
          </label>
        </div>

        {dependente && (
          <div>
            <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
              Responsável financeiro
            </label>
            <select
              id="responsavel_financeiro"
              name="responsavel_financeiro"
              required={dependente}
              defaultValue={paciente?.responsavel_financeiro ?? ""}
              className="field"
            >
              <option value="" disabled>
                Selecione
              </option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
```

(remover o bloco inteiro, sem substituir por nada — o fieldset anterior de "Documentos" passa a ser seguido direto por `{state?.error && ...}`).

- [ ] **Step 2: Parar de buscar/passar `pacientes` nas páginas de criar/editar paciente**

Em `web/app/(app)/(gestao)/pacientes/novo/page.js`:

```js
import PacienteForm from "@/components/PacienteForm";
import { criarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaNovoPaciente() {
  const [pacotes, consultorios] = await Promise.all([listarPacotes(), listarConsultorios()]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Paciente</h1>
      <PacienteForm action={criarPaciente} pacotes={pacotes} consultorios={consultorios} />
    </div>
  );
}
```

Em `web/app/(app)/(gestao)/pacientes/[id]/editar/page.js`:

```js
import PacienteForm from "@/components/PacienteForm";
import { buscarPaciente } from "@/lib/data/pacientes";
import { atualizarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaEditarPaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, pacotes, consultorios] = await Promise.all([
    buscarPaciente(pacienteId),
    listarPacotes(),
    listarConsultorios(),
  ]);
  const acaoComId = atualizarPaciente.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Paciente</h1>
      <PacienteForm action={acaoComId} paciente={paciente} pacotes={pacotes} consultorios={consultorios} />
    </div>
  );
}
```

(`listarPacientesParaSelect` continua existindo em `web/lib/data/pacientes.js` e continua usada por `web/app/(app)/(gestao)/responsaveis-financeiros/novo/page.js`, Task 16 — não remover a função, só esses dois call sites.)

- [ ] **Step 3: Parar de ler/gravar `dependente`/`responsavel_financeiro` e provisionar o responsável próprio em `web/lib/actions/pacientes.js`**

Substituir o arquivo inteiro por:

```js
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verificarVinculosPaciente } from "@/lib/data/pacientes";

function dadosDoFormulario(formData) {
  return {
    nome: formData.get("nome"),
    data_nascimento: formData.get("data_nascimento") || null,
    telefone: formData.get("telefone"),
    email: formData.get("email"),
    endereco: formData.get("endereco") || null,
    consultorio: Number(formData.get("consultorio")),
    pacote: formData.get("pacote") ? Number(formData.get("pacote")) : null,
    valor_sessao: Number(formData.get("valor_sessao")),
    observacoes: formData.get("observacoes") || null,
    documento: formData.get("documento") || null,
    cpf: formData.get("cpf") || null,
    rg_numero: formData.get("rg_numero") || null,
    rg_data_expedicao: formData.get("rg_data_expedicao") || null,
    rg_orgao_emissor: formData.get("rg_orgao_emissor") || null,
  };
}

export async function criarPaciente(prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("Paciente")
    .insert(dados)
    .select("id")
    .single();

  if (error) {
    return { error: "Não foi possível salvar o paciente." };
  }

  const { data: responsavelProprio, error: erroResponsavel } = await supabase
    .from("ResponsavelFinanceiro")
    .insert({ nome: dados.nome, paciente_vinculado: data.id })
    .select("id")
    .single();

  if (erroResponsavel) {
    return { error: "Paciente criado, mas não foi possível provisionar o responsável financeiro próprio." };
  }

  const { error: erroVinculo } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .insert({ paciente: data.id, responsavel: responsavelProprio.id });

  if (erroVinculo) {
    return { error: "Paciente criado, mas não foi possível vincular o responsável financeiro próprio." };
  }

  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function atualizarPaciente(id, prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("Paciente").update(dados).eq("id", id);

  if (error) {
    return { error: "Não foi possível atualizar o paciente." };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}

export async function excluirPaciente(id, prevState, formData) {
  const vinculos = await verificarVinculosPaciente(id);
  if (vinculos.length > 0) {
    return { bloqueado: true, vinculos };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").delete().eq("id", id);

  if (error) {
    return { error: "Não foi possível excluir o paciente." };
  }

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function desativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: false }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}

export async function reativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: true }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}
```

Nota: como `dadosDoFormulario` não inclui mais as chaves `dependente`/`responsavel_financeiro`, `atualizarPaciente` nunca mais toca essas colunas — editar qualquer outro campo de um paciente que já era dependente (ex.: telefone) preserva o `dependente`/`responsavel_financeiro` existente sem sobrescrever com `false`/`null`. Isso é importante: manter essas chaves no objeto de update (mesmo que lidas do form ausente) apagaria silenciosamente o histórico desses pacientes.

- [ ] **Step 4: Verificar que editar um paciente dependente preserva os campos antigos**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: responsavel } = await admin.from('Paciente').insert({ nome: 'Teste Preservar Responsavel', valor_sessao: 100 }).select('id').single();
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Preservar Dependente', dependente: true, responsavel_financeiro: responsavel.id, valor_sessao: 100 }).select('id').single();

  // reproduz o payload que atualizarPaciente agora envia (sem dependente/responsavel_financeiro)
  const dadosSemDependente = { nome: 'Teste Preservar Dependente', telefone: '11999999999', valor_sessao: 100, consultorio: null, pacote: null };
  await admin.from('Paciente').update(dadosSemDependente).eq('id', dependenteRow.id);

  const { data: apos } = await admin.from('Paciente').select('dependente, responsavel_financeiro, telefone').eq('id', dependenteRow.id).single();
  console.log('apos update sem os campos antigos no payload — dependente preservado (esperado true):', apos.dependente, 'responsavel_financeiro preservado (esperado ' + responsavel.id + '):', apos.responsavel_financeiro, 'telefone atualizado:', apos.telefone);

  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('cleanup done');
})();
"
```

Expected: `dependente: true` e `responsavel_financeiro` preservados, `telefone` atualizado — confirma que omitir as chaves do payload (em vez de enviá-las como `false`/`null`) é o comportamento certo.

- [ ] **Step 5: Verificar o provisionamento automático na criação**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  // reproduz o que criarPaciente agora faz apos o insert do paciente
  const { data: paciente } = await admin.from('Paciente').insert({ nome: 'Teste Provisiona Proprio', valor_sessao: 100 }).select('id').single();
  const { data: responsavelProprio } = await admin.from('ResponsavelFinanceiro').insert({ nome: paciente.nome ?? 'Teste Provisiona Proprio', paciente_vinculado: paciente.id }).select('id').single();
  await admin.from('PacienteResponsavelFinanceiro').insert({ paciente: paciente.id, responsavel: responsavelProprio.id });

  const { data: vinculo } = await admin
    .from('PacienteResponsavelFinanceiro')
    .select('ResponsavelFinanceiro!inner(nome, paciente_vinculado)')
    .eq('paciente', paciente.id)
    .single();
  console.log('responsavel proprio vinculado (esperado paciente_vinculado == ' + paciente.id + '):', vinculo.ResponsavelFinanceiro.paciente_vinculado === paciente.id);

  await admin.from('PacienteResponsavelFinanceiro').delete().eq('paciente', paciente.id);
  await admin.from('ResponsavelFinanceiro').delete().eq('id', responsavelProprio.id);
  await admin.from('Paciente').delete().eq('id', paciente.id);
  console.log('cleanup done');
})();
"
```

Expected: `true` — o vínculo próprio criado aponta exatamente pro paciente recém-criado.

- [ ] **Step 6: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/components/PacienteForm.js "web/app/(app)/(gestao)/pacientes/novo/page.js" "web/app/(app)/(gestao)/pacientes/[id]/editar/page.js" web/lib/actions/pacientes.js && git commit -m "feat: remove UI antiga de dependente e provisiona responsavel financeiro proprio na criacao de paciente"
```

---

## Task 18: Adicionar "Responsáveis Financeiros" ao menu de navegação

**Files:**
- Modify: arquivo de navegação principal (localizar com o comando abaixo antes de editar).

- [ ] **Step 1: Localizar o componente de menu/navegação**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && grep -rl "Financeiro" web/components web/app --include="*.js" | grep -iv "financeiro/" | grep -i "nav\|menu\|sidebar\|layout"
```

Abrir o arquivo encontrado (provavelmente algo como `web/components/Sidebar.js`, `web/components/NavMenu.js` ou o `layout.js` de `(gestao)`) e localizar o item de menu "Financeiro" (`href="/financeiro"`).

- [ ] **Step 2: Adicionar o item de menu**

Adicionar um item "Responsáveis Financeiros" (`href="/responsaveis-financeiros"`) logo após o item "Financeiro", seguindo exatamente o mesmo padrão de marcação (classe CSS, ícone se houver) do item existente — copiar a estrutura JSX do item "Financeiro" e trocar `href` e o texto do rótulo.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add -A web/components web/app && git commit -m "feat: adiciona responsaveis financeiros ao menu de navegacao"
```

---

## Task 19: Verificação end-to-end no navegador

**Files:** nenhum (só verificação manual/via browser).

**Interfaces:**
- Consumes: todas as anteriores, rodando juntas via requisição HTTP real (Server Actions dependem de `next/headers`, só são exercitadas de fato numa requisição de verdade).

- [ ] **Step 1: Pedir deploy**

Avisar o usuário para clicar em "Deploy" no EasyPanel (não há API de deploy documentada para este projeto).

- [ ] **Step 2: Criar dados descartáveis via navegador (chrome-devtools MCP, contexto isolado)**

Usar `mcp__chrome-devtools__new_page` com `isolatedContext`. Login, depois:

1. Criar paciente "Paciente Receb E2E" (não dependente), valor da sessão R$150.
2. Ir em `/pacientes/[id]/receber` — nenhuma sessão em aberto ainda, confirmar que o campo "valor a receber como crédito antecipado" aparece; preencher R$300, escolher o responsável "Paciente Receb E2E (o próprio paciente)" (deve já vir pré-selecionado, único da lista), conta e forma de pagamento, confirmar. Expected: redireciona pra `/pacientes/[id]?aba=sessoes`, banner "Crédito disponível: R$ 300,00" aparece.
3. Criar uma sessão avulsa pra esse paciente via `/agenda/nova-sessao`. Voltar na aba Sessões — a sessão nova deve mostrar valor R$150, sem "Recebido", com os links "Receber" e "Usar crédito (R$ 300,00 disponível)".
4. Clicar em "Usar crédito" — expected: a sessão passa a mostrar "Recebido", crédito remanescente cai pra R$150 (revalidar a página / navegar de novo).
5. Criar uma segunda sessão avulsa (R$150). Na Ficha do Paciente, ir em "Receber Sessões", marcar essa sessão via checkbox, confirmar que o total mostra R$150, escolher responsável/conta/forma, confirmar. Expected: sessão vira "Recebido".
6. Tentar cancelar (via edição da sessão, se houver ação de cancelar na UI, ou diretamente) uma das sessões já recebidas — expected: erro informando que precisa desfazer a alocação antes.
7. Ir em `/responsaveis-financeiros` — confirmar que "Paciente Receb E2E" aparece com "1 paciente(s) vinculado(s)".
8. Na Ficha do Paciente, aba Dados, sub-seção "Responsáveis Financeiros": criar um novo responsável avulso "Responsavel Avulso E2E" e vincular. Confirmar que aparece na lista, e que o vínculo "próprio" não tem botão de desvincular mas o novo tem.
9. Voltar em `/responsaveis-financeiros` — "Responsavel Avulso E2E" deve aparecer com "1 paciente(s) vinculado(s)".

- [ ] **Step 3: Testar o fluxo combinado "Registrar Atendimento + pagou"**

Criar uma terceira sessão avulsa. Ir em "Registrar Atendimento", marcar "Paciente pagou nesta sessão?", confirmar que aparece o valor fixo (não editável), o select de responsável (pré-selecionado, único), data/conta/forma. Confirmar. Expected: sessão marcada como Realizada e Recebida.

- [ ] **Step 4: Limpeza**

Excluir via script Node com a service role key (mesmo padrão das tasks anteriores) todas as sessões, recebimentos, lançamentos financeiros, vínculos e responsáveis financeiros criados nos Steps 2-3, e por fim os pacientes "Paciente Receb E2E".

- [ ] **Step 5: Fechar a página do navegador**

Usar `mcp__chrome-devtools__close_page` na aba criada no Step 2.
