# Agente de WhatsApp — backend do proxy (item 13, metade 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a base de código (SQL + Next.js) que o workflow n8n do agente vai consumir: a correção de desambiguação de consultório, a nova tool `agent_definir_consultorio_ativo`, e a rota proxy `/api/agent/call-tool` que expõe as 18 tools pro n8n com auditoria.

**Architecture:** Duas peças independentes entre si mas ambas pré-requisito
do workflow n8n (fora deste plano — vira um plano próprio, "metade 2b",
depois que este aqui estiver em produção): (1) uma migration corrigindo
`_agent_resolve_consultorio` pra lembrar a escolha do profissional via
`agent_sessions`, mais a tool nova de definir consultório ativo; (2) uma
rota Next.js que funciona como proxy único entre o n8n e as 17 tools já
existentes + a nova, com o mesmo padrão de segredo compartilhado já usado
no item 9.

**Tech Stack:** Supabase Postgres (PL/pgSQL), Next.js 16 App Router (Route
Handler), `@supabase/supabase-js` — nada novo, tudo já usado no projeto.

**Spec:** `docs/superpowers/specs/2026-08-19-agente-whatsapp-workflow-n8n-design.md`

**Fora deste plano:** os 3 workflows do n8n em si (`WA - Enviar Mensagem`,
`WA - Inbound Router`, `WA - Agent Psicólogo`), a configuração do webhook
da Evolution API, e a verificação end-to-end com mensagem real — viram um
plano próprio ("metade 2b") depois que a rota deste plano estiver de fato
implantada em produção (o workflow do agente só funciona com a rota no
ar).

## Global Constraints

- Toda função nova/alterada segue o padrão já estabelecido: `security definer`,
  `set search_path = public`, erros de negócio sempre
  `raise exception '<CODIGO>' using errcode = 'P0001'`, `revoke all ... from
  public, anon, authenticated` + `grant execute ... to service_role` quando a
  função for chamável diretamente como tool (não se aplica a
  `_agent_resolve_consultorio`, que só é chamada internamente por outras
  funções — nunca teve grant direto a `service_role` e não precisa ganhar um
  agora).
- `agent_sessions` já existe (`whatsapp_number text primary key`,
  `usuario_id bigint`, `consultorio_ativo_id bigint`, `updated_at
  timestamptz`) — não criar de novo, só fazer upsert nela.
- A lista de tools válidas na rota proxy é uma allowlist fechada — nunca
  aceitar um `tool_name` fora dela, nunca montar o nome da função
  dinamicamente a partir do input.
- Conexão Postgres direta pra aplicar/verificar migrations:
  `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`
  (`SUPABASE_DB_PASSWORD` já disponível no ambiente). `.env.local` em
  `web/` tem `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
- Build/preview local do Next.js: `npm run build` seguido de
  `node .next/standalone/server.js` (nunca `next start` — este projeto usa
  `output: "standalone"`, `next start` não funciona, já descoberto em
  planos anteriores) — copiar `public/` e `.next/static/` pra dentro de
  `.next/standalone/` antes de subir, senão os assets estáticos quebram.
- Qualquer dado de teste (paciente/sessão/usuário/consultório) criado
  durante verificação é descartável e apagado ao final do próprio script.

---

## Task 1: Migration — corrige `_agent_resolve_consultorio` + nova tool `agent_definir_consultorio_ativo`

**Files:**
- Create: `supabase/migrations/20260819000001_fix_resolve_consultorio_e_definir_ativo.sql`

**Interfaces:**
- Consumes: `_agent_get_owner_uuid` (já existe), tabela `agent_sessions`
  (já existe).
- Produces: `_agent_resolve_consultorio(p_whatsapp_number text, p_consultorio_id
  bigint default null) returns bigint` (comportamento alterado, mesma
  assinatura — nenhuma das 17 tools existentes que já chamam essa função
  precisa mudar). `agent_definir_consultorio_ativo(p_whatsapp_number text,
  p_consultorio_id bigint) returns boolean` (nova).

- [ ] **Step 1: Escrever a migration**

```sql
-- Corrige _agent_resolve_consultorio: hoje ela nunca le agent_sessions,
-- entao todo profissional com mais de um consultorio seria interrompido
-- pra desambiguar EM TODA MENSAGEM. Agora, antes de levantar
-- CONSULTORIO_AMBIGUO, checa se ja existe uma escolha salva em
-- agent_sessions.consultorio_ativo_id (via agent_definir_consultorio_ativo,
-- criada nesta mesma migration) e reusa ela.
create or replace function public._agent_resolve_consultorio(
  p_whatsapp_number text,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count int;
  v_result bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_consultorio_id is not null then
    select id into v_result
    from "Consultorio"
    where id = p_consultorio_id and owner = v_owner;

    if v_result is null then
      raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
    end if;

    return v_result;
  end if;

  select count(*) into v_count from "Consultorio" where owner = v_owner;

  if v_count = 0 then
    raise exception 'SEM_CONSULTORIO_CADASTRADO' using errcode = 'P0001';
  elsif v_count = 1 then
    select id into v_result from "Consultorio" where owner = v_owner;
    return v_result;
  end if;

  -- multiplos consultorios: reusa a ultima escolha salva, se ainda valida
  select consultorio_ativo_id into v_result
  from agent_sessions
  where whatsapp_number = p_whatsapp_number;

  if v_result is not null and exists (
    select 1 from "Consultorio" where id = v_result and owner = v_owner
  ) then
    return v_result;
  end if;

  -- o n8n deve capturar essa excecao e chamar agent_listar_consultorios
  -- para o agente perguntar ao usuario, depois agent_definir_consultorio_ativo
  -- pra salvar a escolha antes de tentar de novo a tool original
  raise exception 'CONSULTORIO_AMBIGUO' using errcode = 'P0001';
end;
$$;

-- Tool nova: o agente chama depois de perguntar ao profissional qual
-- consultorio usar, quando _agent_resolve_consultorio levantou
-- CONSULTORIO_AMBIGUO.
create or replace function public.agent_definir_consultorio_ativo(
  p_whatsapp_number text,
  p_consultorio_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_usuario_id bigint;
  v_valido bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  select id into v_valido
  from "Consultorio"
  where id = p_consultorio_id and owner = v_owner;

  if v_valido is null then
    raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
  end if;

  select id into v_usuario_id from "Usuarios" where id_user = v_owner;

  insert into agent_sessions (whatsapp_number, usuario_id, consultorio_ativo_id, updated_at)
  values (p_whatsapp_number, v_usuario_id, p_consultorio_id, now())
  on conflict (whatsapp_number) do update set
    consultorio_ativo_id = excluded.consultorio_ativo_id,
    usuario_id = excluded.usuario_id,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.agent_definir_consultorio_ativo(text, bigint) from public, anon, authenticated;
grant execute on function public.agent_definir_consultorio_ativo(text, bigint) to service_role;
```

- [ ] **Step 2: Aplicar a migration em produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260819000001_fix_resolve_consultorio_e_definir_ativo.sql', 'utf8');
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

- [ ] **Step 3: Verificar com dados descartáveis — profissional com 2 consultórios**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-consultorio-ativo-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  const contato = '11' + Math.floor(900000000 + Math.random()*99999999).toString();
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato, whatsapp_number: '5511900000010', whatsapp_verified: true });
  const { data: c1 } = await admin.from('Consultorio').insert({ nome: 'Consultorio 1', owner: idUser }).select('id').single();
  const { data: c2 } = await admin.from('Consultorio').insert({ nome: 'Consultorio 2', owner: idUser }).select('id').single();

  const r1 = await admin.rpc('agent_listar_consultorios', { p_whatsapp_number: '5511900000010' });
  console.log('1) listar consultorios (esperado 2):', r1.data?.length, r1.error?.message || '');

  const rAmbiguo = await admin.rpc('agent_get_agenda', { p_whatsapp_number: '5511900000010', p_data_inicio: '2026-09-01', p_data_fim: '2026-09-30' });
  console.log('2) tool sem consultorio definido, 2 consultorios (esperado erro CONSULTORIO_AMBIGUO):', rAmbiguo.error?.message);

  const rDefinir = await admin.rpc('agent_definir_consultorio_ativo', { p_whatsapp_number: '5511900000010', p_consultorio_id: c1.id });
  console.log('3) definir consultorio ativo (esperado true):', rDefinir.data, rDefinir.error?.message || '');

  const rAgora = await admin.rpc('agent_get_agenda', { p_whatsapp_number: '5511900000010', p_data_inicio: '2026-09-01', p_data_fim: '2026-09-30' });
  console.log('4) mesma tool de novo, sem informar consultorio (esperado sem erro agora):', rAgora.error?.message || 'sem erro');

  const rInvalido = await admin.rpc('agent_definir_consultorio_ativo', { p_whatsapp_number: '5511900000010', p_consultorio_id: 999999999 });
  console.log('5) definir consultorio invalido (esperado erro CONSULTORIO_INVALIDO):', rInvalido.error?.message);

  await admin.from('Consultorio').delete().in('id', [c1.id, c2.id]);
  await admin.from('agent_sessions').delete().eq('whatsapp_number', '5511900000010');
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup done');
})();
"
```

Expected: passo 1 lista 2 consultórios; passo 2 falha com `CONSULTORIO_AMBIGUO`; passo 3 sucesso (`true`); passo 4 **não** falha mais (a escolha do passo 3 foi reaproveitada); passo 5 falha com `CONSULTORIO_INVALIDO`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260819000001_fix_resolve_consultorio_e_definir_ativo.sql && git commit -m "feat: corrige desambiguacao de consultorio e adiciona agent_definir_consultorio_ativo"
```

---

## Task 2: Rota proxy `POST /api/agent/call-tool`

**Files:**
- Create: `web/app/api/agent/call-tool/route.js`

**Interfaces:**
- Consumes: as 18 tools RPC (17 já existentes + `agent_definir_consultorio_ativo`
  da Task 1), tabela `agent_audit_log` (já existe:
  `whatsapp_number`, `consultorio_id`, `tool_name`, `parametros jsonb`,
  `resultado jsonb`, `sucesso boolean`, `mensagem_erro text`, `criado_em`).
- Produces: endpoint `POST /api/agent/call-tool`, corpo `{tool_name,
  whatsapp_number, params}`, resposta `{ success: true, data }` ou
  `{ success: false, error_code }`. Consumido pelo workflow n8n (fora
  deste plano).

- [ ] **Step 1: Escrever a rota**

```js
import { createAdminClient } from "@/lib/supabase/admin";

const TOOLS_VALIDAS = [
  "agent_listar_consultorios",
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
  "agent_definir_consultorio_ativo",
];

export async function POST(request) {
  const segredo = request.headers.get("x-agent-secret");
  if (!segredo || segredo !== process.env.AGENT_TOOL_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { tool_name, whatsapp_number, params } = await request.json();

  if (!TOOLS_VALIDAS.includes(tool_name)) {
    return Response.json({ success: false, error_code: "TOOL_DESCONHECIDA" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(tool_name, {
    p_whatsapp_number: whatsapp_number,
    ...(params ?? {}),
  });

  await admin.from("agent_audit_log").insert({
    whatsapp_number,
    tool_name,
    parametros: params ?? {},
    resultado: error ? null : data,
    sucesso: !error,
    mensagem_erro: error?.message ?? null,
  });

  if (error) {
    return Response.json({ success: false, error_code: error.message }, { status: 200 });
  }

  return Response.json({ success: true, data });
}
```

(Mesmo padrão de `web/app/carne-leao-automatico/route.js`: header de segredo
+ `createAdminClient()` de `@/lib/supabase/admin`. Resposta de erro de
negócio volta com HTTP 200 — `success: false` no corpo — porque é um erro
*esperado* de fluxo de conversa (ex: sessão não encontrada), não uma falha
da própria rota; só erros de infraestrutura/autenticação usam status HTTP
diferente de 200.)

- [ ] **Step 2: Adicionar a env var localmente pra teste**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const fs = require('fs');
let env = fs.readFileSync('.env.local', 'utf8');
if (!env.includes('AGENT_TOOL_SECRET')) {
  env += '\nAGENT_TOOL_SECRET=teste-local-secret-123\n';
  fs.writeFileSync('.env.local', env);
  console.log('AGENT_TOOL_SECRET adicionada ao .env.local');
} else {
  console.log('AGENT_TOOL_SECRET ja existe no .env.local');
}
"
```

Expected: confirma que a variável foi adicionada (ou já existia).

- [ ] **Step 3: Build + subir preview local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
cp -r public .next/standalone/ 2>/dev/null
cp -r .next/static .next/standalone/.next/ 2>/dev/null
PORT=3012 node .next/standalone/server.js
```

(Rodar em background — precisa ficar de pé pro Step 4. Confirmar antes que
a porta 3012 está livre: `netstat -ano | grep :3012` — se algo já estiver
nela, usar outra porta livre nos passos seguintes.)

Expected: servidor sobe sem erro, respondendo em `http://localhost:3012`.

- [ ] **Step 4: Verificar a rota com dados descartáveis — sucesso, tool inválida, segredo errado**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const email = 'teste-proxy-route-' + Date.now() + '@example.com';
  const { data: authData } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123', email_confirm: true });
  const idUser = authData.user.id;
  const contato = '11' + Math.floor(900000000 + Math.random()*99999999).toString();
  await admin.from('Usuarios').insert({ id_user: idUser, email, nome: 'Teste', role: 'psicologo', aprovado: true, plano: 'gestao_marketing', contato, whatsapp_number: '5511900000011', whatsapp_verified: true });
  await admin.from('Consultorio').insert({ nome: 'Consultorio Teste', owner: idUser });

  // 1) tool valida, segredo correto -- espera sucesso
  const r1 = await fetch('http://localhost:3012/api/agent/call-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-secret': 'teste-local-secret-123' },
    body: JSON.stringify({ tool_name: 'agent_listar_consultorios', whatsapp_number: '5511900000011', params: {} }),
  });
  const j1 = await r1.json();
  console.log('1) tool valida (esperado success true, 1 consultorio):', r1.status, JSON.stringify(j1));

  // 2) tool invalida
  const r2 = await fetch('http://localhost:3012/api/agent/call-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-secret': 'teste-local-secret-123' },
    body: JSON.stringify({ tool_name: 'agent_drop_database', whatsapp_number: '5511900000011', params: {} }),
  });
  console.log('2) tool invalida (esperado 400, TOOL_DESCONHECIDA):', r2.status, JSON.stringify(await r2.json()));

  // 3) segredo errado
  const r3 = await fetch('http://localhost:3012/api/agent/call-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-secret': 'segredo-errado' },
    body: JSON.stringify({ tool_name: 'agent_listar_consultorios', whatsapp_number: '5511900000011', params: {} }),
  });
  console.log('3) segredo errado (esperado 401):', r3.status);

  // confirma gravacao em agent_audit_log (so as 2 chamadas que passaram do check de segredo)
  const { data: log } = await admin.from('agent_audit_log').select('tool_name, sucesso').eq('whatsapp_number', '5511900000011').order('criado_em');
  console.log('4) linhas em agent_audit_log (esperado 2 -- a invalida NAO deveria logar, so passou pela validacao de secret):', log.length, JSON.stringify(log));

  await admin.from('agent_audit_log').delete().eq('whatsapp_number', '5511900000011');
  await admin.from('Consultorio').delete().eq('owner', idUser);
  await admin.from('Usuarios').delete().eq('id_user', idUser);
  await admin.auth.admin.deleteUser(idUser);
  console.log('cleanup done');
})();
"
```

Expected: passo 1 retorna `success: true` com 1 consultório; passo 2 retorna HTTP 400 com `TOOL_DESCONHECIDA`; passo 3 retorna HTTP 401; passo 4 mostra **2** linhas em `agent_audit_log` (a chamada de tool inválida nunca chega no `.insert()`, já que a rota retorna antes disso — se o número vier diferente, investigar antes de prosseguir).

- [ ] **Step 5: Parar o servidor de preview e reverter a env var de teste**

```bash
netstat -ano | grep :3012 | grep LISTENING | awk '{print $5}' | xargs -I{} taskkill //PID {} //F 2>/dev/null || echo "nada rodando na 3012"
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const semTeste = env.replace(/\nAGENT_TOOL_SECRET=teste-local-secret-123\n/, '\n');
fs.writeFileSync('.env.local', semTeste);
console.log('AGENT_TOOL_SECRET de teste removida do .env.local');
"
```

Expected: servidor parado, `.env.local` sem a variável de teste (o valor
real de produção será configurado direto no EasyPanel quando a rota for
implantada — não faz parte deste plano configurar produção).

- [ ] **Step 6: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add "web/app/api/agent/call-tool/route.js" && git commit -m "feat: adiciona rota proxy /api/agent/call-tool pro workflow n8n do agente"
```

---

## Task 3: Atualizar o backlog

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/backlog-novas-funcionalidades.md`

**Interfaces:**
- Consumes: Tasks 1 e 2.

- [ ] **Step 1: Nota em `docs/backlog.md`**

Na linha do item "13 (metade 2)" da tabela "A realizar", acrescentar ao
final da descrição: `" — backend do proxy (migration + rota
/api/agent/call-tool) pronto; falta só o workflow n8n em si (metade 2b)"`.

- [ ] **Step 2: Nota em `docs/backlog-novas-funcionalidades.md`**

Na seção 13, no parágrafo de status, acrescentar uma frase: "Backend do
proxy (`_agent_resolve_consultorio` corrigido, `agent_definir_consultorio_ativo`
nova, rota `/api/agent/call-tool`) pronto em 2026-08-19 — falta só
construir os workflows do n8n em si, que viram um plano próprio."

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add docs/backlog.md docs/backlog-novas-funcionalidades.md && git commit -m "docs: marca o backend do proxy do agente de WhatsApp como pronto (item 13, metade 2a)"
```
