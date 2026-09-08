# Início de operação via WhatsApp — Fase 2 (workflow n8n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o backend da Fase 1 (já em produção) ao WhatsApp de verdade — cadastro de conta nova por conversa, onboarding guiado conduzido pelo `WA - Agent Psicólogo` já existente, e a checagem de revalidação de 30 dias — via extensões nos 2 workflows n8n existentes e um workflow novo.

**Architecture:** Addendum pequeno ao backend (1 RPC nova, `agent_avancar_onboarding`, que fecha a lacuna de nada avançar `onboarding_etapa`). Workflow novo `WA - Onboarding` com 2 gatilhos independentes (conversa de cadastro + clique do link mágico). `WA - Inbound Router` ganha diferenciação por linguagem natural pro ramo de número desconhecido e a checagem de janela de 30 dias. `WA - Agent Psicólogo` ganha 4 tools novas e uma seção condicional no system prompt que conduz o onboarding guiado sem virar um "modo" separado.

**Tech Stack:** Supabase Postgres (PL/pgSQL), Next.js Route Handler (1 linha em arquivo já existente), n8n 2.21.0 self-hosted (API REST pública `X-N8N-API-KEY`), scripts Node `.mjs` (mesmo padrão de `scripts/n8n-agente-whatsapp/`).

**Spec:** `docs/superpowers/specs/2026-09-08-inicio-operacao-whatsapp-fase2-n8n-design.md` (e, pro contrato exato das rotas/RPCs da Fase 1 que este plano consome, `docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md`)

## Global Constraints

- **Segredos desta sessão** (não vão pro repositório): `N8N_API_KEY` e `N8N_BASE_URL` já salvos em
  `C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env`
  — sempre `source` esse arquivo antes de rodar qualquer script deste plano. `N8N_BASE_URL=https://psifacil-n8n.lcuzxl.easypanel.host`.
- **Segredos retiráveis da VPS via SSH** (`ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130`, chave já presente no perfil deste ambiente): `AGENT_TOOL_SECRET` está no serviço `psifacil_psifacil` (`docker service inspect psifacil_psifacil --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep ^AGENT_TOOL_SECRET=`); `EVOLUTION_API_KEY` (nome real na VPS: `AUTHENTICATION_API_KEY`) está no serviço `psifacil_evolution-api`. Nunca escrever esses valores em arquivo dentro do repo — só exportar pro shell que vai rodar o script.
- **`N8N_ONBOARDING_SECRET` é um segredo NOVO desta entrega**, gerado do zero (ex: `openssl rand -hex 32`) — não existe em nenhum lugar ainda. Precisa ficar idêntico em 3 lugares: EasyPanel do app (`N8N_ONBOARDING_SECRET`), a credencial n8n nova (Task 3), e não tem terceiro lugar de fato — só os dois acima (diferente do `AGENT_TOOL_SECRET`, que tem 2 lugares + o header do próprio n8n contando como um dos dois já citados).
- **Estado real da infra confirmado em 2026-09-08**: produção do app Next.js **não está com o código da Fase 1** (último deploy 2026-09-02, antes de toda a Fase 1) — só um `git push` não implanta, precisa de clique manual "Deploy" no EasyPanel. SMTP do Supabase Auth (`signInWithOtp`) retornando 500 consistentemente, causa raiz na plataforma Supabase, sem solução do nosso lado (config e credenciais confirmadas corretas). **Nenhuma das duas coisas bloqueia a construção/ativação dos workflows** (Tasks 1-8 abaixo) — só bloqueiam o teste de ponta a ponta final (Task 9), que fica marcado como podendo ficar pendente entre sessões.
- **Conexão Postgres direta** pra aplicar a migration da Task 1: `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.rohulajgyxdangxfurha.supabase.co:5432/postgres` (`SUPABASE_DB_PASSWORD` já disponível no ambiente). `web/.env.local` tem `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` pros scripts de verificação.
- **`onboarding_etapa` — valores válidos** (constraint já existe no banco, `agent_sessions_onboarding_etapa_check`): `null`, `'aguardando_confirmacao_email'`, `'consultorio'`, `'paciente'`, `'conta'`, `'concluido'`.
- **`ultima_validacao_seguranca_em` nulo é tratado como isento** da janela de 30 dias (decisão do usuário, 2026-09-08) — só passa a valer depois da primeira validação real.
- **`whatsapp_number` que chega em qualquer tool/workflow novo é sempre `numero_normalizado`**, extraído pelo nó "Normalizar Payload" do Router — nunca preenchido pelo LLM.
- Padrão de nó de tool HTTP (`toolHttpRequest`) já estabelecido em `scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs`, função `construirNoTool` — `jsonBody` como STRING concatenada com placeholders `{nome}` literais (nunca objeto JS resolvido, nunca `$fromAI`), espaço obrigatório entre `}` adjacentes no template pra não formar um `}}` acidental que corta a expressão n8n no meio. Qualquer tool nova segue esse padrão exatamente — os dois bugs que esse padrão evita já foram corrigidos uma vez em produção, não reintroduzir.
- Todos os scripts de provisionamento são **idempotentes**: se `ids.json` já tem o id (credencial ou workflow), fazem `PATCH`/`PUT`; senão `POST` e gravam o id novo em `ids.json`. Seguir esse padrão em qualquer script novo.
- Sem framework de teste automatizado (convenção já estabelecida) — verificação por script direto (SQL/`pg`, `@supabase/supabase-js`) ou chamada real à API do n8n/curl.

---

## Task 1: Migration — RPC `agent_avancar_onboarding`

**Files:**
- Create: `supabase/migrations/20260908000001_add_agent_avancar_onboarding.sql`

**Interfaces:**
- Produces: `agent_avancar_onboarding(p_whatsapp_number text, p_etapa_atual text) returns text` — avança `agent_sessions.onboarding_etapa` pra próxima etapa da sequência, levanta `ONBOARDING_ETAPA_INVALIDA` se `p_etapa_atual` não bater com o valor real. Consumida pela Task 2 (allowlist) e pelo `WA - Agent Psicólogo` (Task 5).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260908000001_add_agent_avancar_onboarding.sql
--
-- Fecha uma lacuna real da Fase 1: nenhuma das 3 RPCs de criacao
-- (agent_criar_consultorio/paciente/conta_bancaria) avanca
-- agent_sessions.onboarding_etapa, e nao existe jeito de "pular" uma
-- etapa sem criar o registro correspondente. O LLM chama esta tool
-- SEMPRE depois de terminar ou pular uma etapa (spec
-- docs/superpowers/specs/2026-09-08-inicio-operacao-whatsapp-fase2-n8n-design.md).
create or replace function public.agent_avancar_onboarding(
  p_whatsapp_number text,
  p_etapa_atual text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa_real text;
  v_proxima text;
begin
  select onboarding_etapa into v_etapa_real
  from agent_sessions
  where whatsapp_number = p_whatsapp_number;

  if v_etapa_real is null or v_etapa_real <> p_etapa_atual then
    raise exception 'ONBOARDING_ETAPA_INVALIDA' using errcode = 'P0001';
  end if;

  v_proxima := case v_etapa_real
    when 'consultorio' then 'paciente'
    when 'paciente' then 'conta'
    when 'conta' then 'concluido'
    else 'concluido'
  end;

  update agent_sessions set onboarding_etapa = v_proxima
  where whatsapp_number = p_whatsapp_number;

  return v_proxima;
end;
$$;

revoke all on function public.agent_avancar_onboarding(text, text) from public, anon, authenticated;
grant execute on function public.agent_avancar_onboarding(text, text) to service_role;
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260908000001_add_agent_avancar_onboarding.sql', 'utf8');
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

- [ ] **Step 3: Testar a progressão e a validação de etapa fora de ordem**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
const numero = '5511900000020';

(async () => {
  await admin.from('agent_sessions').upsert({ whatsapp_number: numero, onboarding_etapa: 'consultorio' }, { onConflict: 'whatsapp_number' });

  const { data: p1, error: e1 } = await admin.rpc('agent_avancar_onboarding', { p_whatsapp_number: numero, p_etapa_atual: 'consultorio' });
  console.log('consultorio -> esperado paciente:', p1, e1?.message || '');

  const { data: p2 } = await admin.rpc('agent_avancar_onboarding', { p_whatsapp_number: numero, p_etapa_atual: 'paciente' });
  console.log('paciente -> esperado conta:', p2);

  const { data: p3 } = await admin.rpc('agent_avancar_onboarding', { p_whatsapp_number: numero, p_etapa_atual: 'conta' });
  console.log('conta -> esperado concluido:', p3);

  const { error: eErrado } = await admin.rpc('agent_avancar_onboarding', { p_whatsapp_number: numero, p_etapa_atual: 'consultorio' });
  console.log('etapa fora de ordem (esperado ONBOARDING_ETAPA_INVALIDA):', eErrado?.message);

  await admin.from('agent_sessions').delete().eq('whatsapp_number', numero);
  console.log('dados de teste limpos');
})();
"
```

Expected: progressão `consultorio → paciente → conta → concluido`, chamada fora de ordem rejeitada com `ONBOARDING_ETAPA_INVALIDA`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260908000001_add_agent_avancar_onboarding.sql && git commit -m "feat(whatsapp-agent): adiciona RPC agent_avancar_onboarding"
```

---

## Task 2: `/api/agent/call-tool` — allowlist da tool nova

**Files:**
- Modify: `web/app/api/agent/call-tool/route.js`

**Interfaces:**
- Consumes: `agent_avancar_onboarding` (Task 1).
- Produces: a tool fica chamável pela rota já em produção, isenta de checagem de plano enquanto o onboarding não termina (mesmo mecanismo das 3 tools de criação, já implementado na Fase 1).

- [ ] **Step 1: Adicionar `agent_avancar_onboarding` às duas listas**

Localize `TOOLS_VALIDAS` e `TOOLS_ONBOARDING` (adicionados na Fase 1) e acrescente a nova tool nos dois:

```js
const TOOLS_VALIDAS = [
  // ... as 18 tools já existentes (16 originais + 3 de criação da Fase 1) ...
  "agent_avancar_onboarding",
];

const TOOLS_ONBOARDING = [
  "agent_criar_consultorio",
  "agent_criar_paciente",
  "agent_criar_conta_bancaria",
  "agent_avancar_onboarding",
];
```

- [ ] **Step 2: Build local**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 3: Testar via curl contra `next start` local**

Reaproveitando o padrão já usado na Fase 1 (servidor buildado em background, `AGENT_TOOL_SECRET` só como env var de shell):

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && AGENT_TOOL_SECRET=teste-local-secreto npm run start &
sleep 5
curl -s -X POST http://localhost:3000/api/agent/call-tool \
  -H "x-agent-secret: teste-local-secreto" -H "Content-Type: application/json" \
  -d '{"tool_name":"agent_avancar_onboarding","whatsapp_number":"5511900000021","params":{"p_etapa_atual":"consultorio"}}'
```

Expected: `{"success":false,"error_code":"ONBOARDING_ETAPA_INVALIDA"}` (número de teste não tem `agent_sessions`, então `onboarding_etapa` real é `null` — confirma que a tool está na allowlist e a RPC responde; o erro de negócio é esperado, não um `TOOL_DESCONHECIDA`). Pare o servidor em background depois (`kill %1` ou equivalente).

- [ ] **Step 4: Commit**

```bash
git add web/app/api/agent/call-tool/route.js && git commit -m "feat(whatsapp-agent): adiciona agent_avancar_onboarding ao proxy"
```

---

## Task 3: Credencial n8n nova — `onboardingWebhookSecret`

**Files:**
- Modify: `scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs`

**Interfaces:**
- Produces: credencial n8n `onboardingWebhookSecret` (chave `x-onboarding-secret`), id gravado em `ids.json.credenciais.onboardingWebhookSecret`. Consumida pela Task 4 (gatilho `Webhook` do `WA - Onboarding`).

- [ ] **Step 1: Adicionar a variável obrigatória**

```js
const obrigatorias = [
  "AGENT_TOOL_SECRET",
  "EVOLUTION_API_KEY",
  "SUPABASE_DB_PASSWORD",
  "GEMINI_API_KEY",
  "WEBHOOK_SHARED_SECRET",
  "N8N_ONBOARDING_SECRET",
];
```

- [ ] **Step 2: Adicionar a credencial nova ao array `credenciais`**

Inserir depois da entrada `webhookSecret` existente:

```js
  {
    // Autentica o gatilho Webhook do WA - Onboarding, chamado por
    // /auth/callback (Next.js) quando um link magico relacionado a
    // WhatsApp e clicado. Mesmo padrao do webhookSecret acima (headerAuth,
    // "none" em allowedHttpRequestDomains -- so autentica entrada, nunca
    // usada em no de saida). Valor = N8N_ONBOARDING_SECRET, precisa ficar
    // identico ao que for configurado em EasyPanel (env var do app).
    chave: "onboardingWebhookSecret",
    payload: {
      name: "Onboarding WhatsApp -> n8n (shared secret)",
      type: "httpHeaderAuth",
      data: {
        name: "x-onboarding-secret",
        value: process.env.N8N_ONBOARDING_SECRET,
        allowedHttpRequestDomains: "none",
      },
    },
  },
```

- [ ] **Step 2: Rodar o script**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
export N8N_ONBOARDING_SECRET=$(openssl rand -hex 32)
echo "N8N_ONBOARDING_SECRET gerado (guarde para as Tasks seguintes e para configurar no EasyPanel depois): $N8N_ONBOARDING_SECRET" >> "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
# AGENT_TOOL_SECRET/EVOLUTION_API_KEY/WEBHOOK_SHARED_SECRET/GEMINI_API_KEY:
# buscar via SSH na VPS (ver Global Constraints) e exportar nesta mesma sessao de shell antes de rodar:
node scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs
```

Expected: as 5 credenciais já existentes são atualizadas (`PATCH`, sem mudança de valor pras 4 que não mudaram — reafirma o estado atual) e `onboardingWebhookSecret` é criada (`POST`), `ids.json` ganha a chave nova.

- [ ] **Step 3: Verificar `ids.json`**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && cat scripts/n8n-agente-whatsapp/ids.json
```

Expected: `credenciais.onboardingWebhookSecret` presente com um id novo.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs scripts/n8n-agente-whatsapp/ids.json && git commit -m "feat(whatsapp-agent): adiciona credencial n8n onboardingWebhookSecret"
```

---

## Task 4: Workflow novo `WA - Onboarding` (2 gatilhos)

**Files:**
- Create: `scripts/n8n-agente-whatsapp/06-workflow-onboarding.mjs`

**Interfaces:**
- Consumes: credencial `proxySecret` (chama `/api/agent/onboarding`), credencial `gemini`, credencial `postgres`, credencial `onboardingWebhookSecret` (Task 3), workflow `enviarMensagem` (`ids.json.workflows.enviarMensagem`).
- Produces: workflow `WA - Onboarding` (id gravado em `ids.json.workflows.onboarding`). Gatilho 1 (`Execute Workflow Trigger`, inputs `{whatsapp_number, mensagem_texto}`, retorna `{output}`) consumido pela Task 6 (Router). Gatilho 2 (`Webhook`) consumido por `/auth/callback` via `N8N_ONBOARDING_CONTINUE_URL` (fora deste plano configurar essa env var — feito manualmente no EasyPanel, Task 8 documenta).

- [ ] **Step 1: Escrever o script do workflow**

```js
// scripts/n8n-agente-whatsapp/06-workflow-onboarding.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { postgres: credPostgresId, gemini: credGeminiId, proxySecret: credProxyId, onboardingWebhookSecret: credOnboardingWebhookId } = ids.credenciais;
const wfEnviarMensagem = ids.workflows.enviarMensagem;

// Mesmo padrao de construirNoTool de 03-workflow-agent-psicologo.mjs:
// jsonBody como STRING concatenada, placeholders "{nome}" literais, espaco
// entre "}" adjacentes pra nao formar um "}}" acidental. Aqui e uma unica
// tool chamando /api/agent/onboarding (nao /api/agent/call-tool -- corpo
// diferente: "acao" em vez de "tool_name", sem "params" aninhado).
function construirNoToolCriarConta() {
  const jsonBody =
    `={{ '{"acao": "criar_conta", "whatsapp_number": ' + JSON.stringify($('Execute Workflow Trigger').first().json.whatsapp_number) + ', "nome": {nome}, "email": {email} }' }}`;
  return {
    parameters: {
      toolDescription: "Cria a conta do profissional (nome + e-mail) e dispara o link magico de confirmacao por e-mail. So chame depois de coletar nome E e-mail do profissional.",
      method: "POST",
      url: "=https://psiagente.com.br/api/agent/onboarding",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      placeholderDefinitions: {
        values: [
          { name: "nome", description: "Nome completo do profissional.", type: "string" },
          { name: "email", description: "E-mail do profissional, pra onde vai o link de confirmacao.", type: "string" },
        ],
      },
      options: {},
    },
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    typeVersion: 1.1,
    position: [240, 320],
    id: "c8d17000-0000-4000-8000-000000000010",
    name: "agent_criar_conta",
    credentials: {
      httpHeaderAuth: { id: credProxyId, name: "Agent Tool Secret - proxy Next.js" },
    },
  };
}

const SYSTEM_PROMPT_CADASTRO = `Você é o(a) assistente de boas-vindas de um sistema de gestão pra psicólogos, no WhatsApp. Alguém te mandou uma mensagem de um número que ainda não está vinculado a nenhuma conta. Tom acolhedor, respostas curtas (é WhatsApp), sem markdown pesado.

Primeiro descubra: essa pessoa já usa o sistema (tem conta feita pelo aplicativo ou por outro número de WhatsApp) ou é a primeira vez? Pergunte isso de forma natural, sem menu numerado.

Se a pessoa já tem conta: oriente a gerar um código de 6 dígitos em /configuracoes/whatsapp no aplicativo e mandar esse código aqui pra esta mesma conversa — não chame nenhuma ferramenta, só oriente.

Se é a primeira vez: colete o nome completo e o e-mail da pessoa (uma pergunta de cada vez, sem pedir os dois juntos) e então chame agent_criar_conta. Depois de chamar, avise que um link de confirmação foi mandado por e-mail e que ela precisa clicar nesse link pra continuar.

Tradução de erro: nunca mostre um código de erro cru. WHATSAPP_JA_CADASTRADO -> "esse número já tem uma conta vinculada — te mandei um link no e-mail dessa conta pra confirmar que é você"; EMAIL_JA_CADASTRADO -> "esse e-mail já tem uma conta — te mandei um link nesse e-mail pra confirmar que é você"; LIMITE_TENTATIVAS_CADASTRO -> "muitas tentativas em pouco tempo, espera um pouco e tenta de novo"; ERRO_ENVIAR_LINK -> "tive um problema pra mandar o e-mail agora, pode tentar de novo daqui a pouco?"; DADOS_INCOMPLETOS -> peça o dado que faltou de novo.`;

const workflow = {
  name: "WA - Onboarding",
  nodes: [
    {
      parameters: {
        workflowInputs: {
          values: [{ name: "whatsapp_number" }, { name: "mensagem_texto" }],
        },
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      id: "c8d17000-0000-4000-8000-000000000001",
      name: "Execute Workflow Trigger",
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $json.mensagem_texto }}",
        options: { systemMessage: "=" + SYSTEM_PROMPT_CADASTRO },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2.1,
      position: [240, 0],
      id: "c8d17000-0000-4000-8000-000000000002",
      name: "AI Agent Cadastro",
    },
    {
      parameters: {
        modelName: "models/gemini-3.5-flash-lite",
        options: {},
      },
      type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      typeVersion: 1,
      position: [120, 200],
      id: "c8d17000-0000-4000-8000-000000000003",
      name: "Google Gemini Chat Model",
      credentials: {
        googlePalmApi: { id: credGeminiId, name: "Google Gemini - agente WhatsApp" },
      },
    },
    {
      parameters: {
        sessionIdType: "customKey",
        sessionKey: "={{ $('Execute Workflow Trigger').first().json.whatsapp_number }}",
        tableName: "n8n_chat_histories",
        contextWindowLength: 10,
      },
      type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
      typeVersion: 1.3,
      position: [280, 200],
      id: "c8d17000-0000-4000-8000-000000000004",
      name: "Postgres Chat Memory",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
    },
    construirNoToolCriarConta(),
    {
      parameters: {
        httpMethod: "POST",
        path: "wa-onboarding-confirmacao-f3a91c7d0e2b4a68",
        responseMode: "onReceived",
        authentication: "headerAuth",
        options: {},
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 400],
      id: "c8d17000-0000-4000-8000-000000000020",
      name: "Webhook Confirmacao Link",
      webhookId: "wa-onboarding-confirmacao",
      credentials: {
        httpHeaderAuth: { id: credOnboardingWebhookId, name: "Onboarding WhatsApp -> n8n (shared secret)" },
      },
    },
    {
      parameters: {
        operation: "executeQuery",
        query:
          "update \"Usuarios\" set whatsapp_verified = true where whatsapp_number = $1;\n\nupdate agent_sessions\nset ultima_validacao_seguranca_em = now(),\n    link_confirmacao_pendente = false,\n    onboarding_etapa = case when onboarding_etapa = 'aguardando_confirmacao_email' then 'consultorio' else onboarding_etapa end\nwhere whatsapp_number = $1\nreturning onboarding_etapa;",
        options: {
          queryReplacement: "={{ [$json.body.whatsapp_number] }}",
        },
      },
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [220, 400],
      id: "c8d17000-0000-4000-8000-000000000021",
      name: "Confirmar Validacao",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
      onError: "continueErrorOutput",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.onboarding_etapa }}", rightValue: "consultorio", operator: { type: "string", operation: "equals" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [440, 400],
      id: "c8d17000-0000-4000-8000-000000000022",
      name: "Era cadastro novo?",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Webhook Confirmacao Link').item.json.body.whatsapp_number }}",
            mensagem: "Conta confirmada! Vamos configurar seu primeiro consultório — qual o nome dele?",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [660, 360],
      id: "c8d17000-0000-4000-8000-000000000023",
      name: "Enviar: iniciar onboarding guiado",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Webhook Confirmacao Link').item.json.body.whatsapp_number }}",
            mensagem: "Confirmado! Pode continuar de onde parou.",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [660, 440],
      id: "c8d17000-0000-4000-8000-000000000024",
      name: "Enviar: revalidacao confirmada",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Webhook Confirmacao Link').item.json.body.whatsapp_number }}",
            mensagem: "Tive um problema aqui do meu lado confirmando seu cadastro. Manda outra mensagem daqui a pouco que eu tento de novo.",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [440, 520],
      id: "c8d17000-0000-4000-8000-000000000025",
      name: "Enviar: erro na confirmacao",
    },
  ],
  connections: {
    "Execute Workflow Trigger": { main: [[{ node: "AI Agent Cadastro", type: "main", index: 0 }]] },
    "Google Gemini Chat Model": { ai_languageModel: [[{ node: "AI Agent Cadastro", type: "ai_languageModel", index: 0 }]] },
    "Postgres Chat Memory": { ai_memory: [[{ node: "AI Agent Cadastro", type: "ai_memory", index: 0 }]] },
    agent_criar_conta: { ai_tool: [[{ node: "AI Agent Cadastro", type: "ai_tool", index: 0 }]] },
    "Webhook Confirmacao Link": { main: [[{ node: "Confirmar Validacao", type: "main", index: 0 }]] },
    "Confirmar Validacao": {
      main: [
        [{ node: "Era cadastro novo?", type: "main", index: 0 }],
        [{ node: "Enviar: erro na confirmacao", type: "main", index: 0 }],
      ],
    },
    "Era cadastro novo?": {
      main: [
        [{ node: "Enviar: iniciar onboarding guiado", type: "main", index: 0 }],
        [{ node: "Enviar: revalidacao confirmada", type: "main", index: 0 }],
      ],
    },
  },
  settings: { executionOrder: "v1" },
};

const idsPath2 = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
ids.workflows = ids.workflows || {};
if (ids.workflows.onboarding) {
  const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows.onboarding}`, workflow);
  console.log(`Workflow "WA - Onboarding" atualizado, id=${atualizado.id}, nós=${workflow.nodes.length}`);
} else {
  const criado = await n8nRequest("POST", "/workflows", workflow);
  console.log(`Workflow "WA - Onboarding" criado, id=${criado.id}, nós=${workflow.nodes.length}`);
  ids.workflows.onboarding = criado.id;
  fs.writeFileSync(idsPath2, JSON.stringify(ids, null, 2));
}
```

- [ ] **Step 2: Rodar o script**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
node scripts/n8n-agente-whatsapp/06-workflow-onboarding.mjs
```

Expected: `Workflow "WA - Onboarding" criado, id=..., nós=10`. `ids.json.workflows.onboarding` gravado.

- [ ] **Step 3: Verificar via API que o workflow foi criado com a estrutura esperada**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
WFID=$(node -e "console.log(require('./scripts/n8n-agente-whatsapp/ids.json').workflows.onboarding)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WFID" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const w = JSON.parse(d);
  console.log('nome:', w.name, '| nos:', w.nodes.length, '| ativo:', w.active);
  console.log('tipos de gatilho:', w.nodes.filter(n => n.type.includes('Trigger') || n.type === 'n8n-nodes-base.webhook').map(n => n.type));
});
"
```

Expected: `nome: WA - Onboarding | nos: 10 | ativo: false` (ainda não ativado — Task 7), 2 gatilhos (`executeWorkflowTrigger` e `webhook`).

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/06-workflow-onboarding.mjs scripts/n8n-agente-whatsapp/ids.json && git commit -m "feat(whatsapp-agent): cria workflow WA - Onboarding"
```

---

## Task 5: Extensão do `WA - Agent Psicólogo` — 4 tools + onboarding guiado

**Files:**
- Modify: `scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs`

**Interfaces:**
- Consumes: `agent_criar_consultorio`/`agent_criar_paciente`/`agent_criar_conta_bancaria` (Fase 1), `agent_avancar_onboarding` (Task 1).
- Produces: `WA - Agent Psicólogo` com 20 tools (16 + 4), aceita `onboarding_etapa` como input novo do `Execute Workflow Trigger`. Consumido pela Task 6 (Router passa `onboarding_etapa`).

- [ ] **Step 1: Adicionar as 4 tools ao array `tools`**

Acrescentar ao final do array `tools` (depois de `agent_registrar_anamnese`):

```js
  {
    nome: "agent_criar_consultorio",
    descricao: "Cria um consultório novo pro profissional durante o onboarding inicial. Só chame se o profissional estiver configurando o primeiro consultório (onboarding_etapa = consultorio).",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome do consultório." },
      { nome: "p_telefone", tipo: "string", desc: "Telefone de atendimento. Se o profissional não falar, envie string vazia." },
      { nome: "p_email_atendimento", tipo: "string", desc: "E-mail de atendimento. Se o profissional não falar, envie string vazia." },
      { nome: "p_endereco", tipo: "string", desc: "Endereço do consultório. Se o profissional não falar, envie string vazia." },
    ],
  },
  {
    nome: "agent_criar_paciente",
    descricao: "Cria um paciente novo. Durante o onboarding (onboarding_etapa = paciente), use pra cadastrar o primeiro paciente se o profissional quiser.",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome do paciente." },
      { nome: "p_telefone", tipo: "string", desc: "Telefone do paciente. Se não informado, envie string vazia." },
      { nome: "p_email", tipo: "string", desc: "E-mail do paciente. Se não informado, envie string vazia." },
      { nome: "p_valor_sessao", tipo: "number", desc: "Valor da sessão em reais. Se não informado, envie 0." },
    ],
  },
  {
    nome: "agent_criar_conta_bancaria",
    descricao: "Cria uma conta financeira/bancária pro profissional. Durante o onboarding (onboarding_etapa = conta), só nome e banco são obrigatórios.",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome/apelido da conta (ex: Conta Corrente)." },
      { nome: "p_banco", tipo: "string", desc: "Nome do banco." },
      { nome: "p_agencia", tipo: "string", desc: "Agência. Se não informado, envie string vazia." },
      { nome: "p_numero", tipo: "string", desc: "Número da conta. Se não informado, envie string vazia." },
      { nome: "p_tipo", tipo: "string", desc: "Tipo da conta (corrente/poupança). Se não informado, envie string vazia." },
    ],
  },
  {
    nome: "agent_avancar_onboarding",
    descricao: "Avança o profissional pra próxima etapa do onboarding guiado. Chame SEMPRE depois de terminar (criou o registro) ou pular uma etapa — nunca decida sozinho, sempre chame esta tool pra confirmar o avanço.",
    params: [
      { nome: "p_etapa_atual", tipo: "string", desc: "A etapa atual do onboarding (o valor de onboarding_etapa que você recebeu: consultorio, paciente ou conta)." },
    ],
  },
```

- [ ] **Step 2: Adicionar `onboarding_etapa` ao `Execute Workflow Trigger`**

Localize o nó `Execute Workflow Trigger` e adicione ao array `workflowInputs.values`:

```js
    {
      parameters: {
        workflowInputs: {
          values: [
            { name: "whatsapp_number" },
            { name: "mensagem_texto" },
            { name: "usuario_nome" },
            { name: "onboarding_etapa" },
          ],
        },
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      id: "a9e17000-0000-4000-8000-000000000001",
      name: "Execute Workflow Trigger",
    },
```

- [ ] **Step 3: Adicionar a seção condicional de onboarding e as traduções de erro novas ao `SYSTEM_PROMPT`**

Adicionar ao final do template string `SYSTEM_PROMPT` (antes do fechamento de crase), depois da frase sobre `alerta=true`:

```js
Onboarding guiado: se {{ $json.onboarding_etapa }} for "consultorio", "paciente" ou "conta", o profissional ainda está no onboarding inicial — priorize guiar essa etapa (pergunte o que falta, ofereça pular), mas sem travar: se ele perguntar outra coisa, responda normalmente com as demais ferramentas e só retome o onboarding na resposta seguinte. Em cada etapa: crie o registro correspondente (agent_criar_consultorio/agent_criar_paciente/agent_criar_conta_bancaria) OU, se o profissional quiser pular, não crie nada — nos dois casos, chame agent_avancar_onboarding em seguida passando a etapa atual. Quando agent_avancar_onboarding retornar "concluido", mande uma mensagem final resumindo o que foi criado e avisando que o resto pode ser feito a qualquer momento, só pedindo (ex: "cadastra paciente X") ou pelo aplicativo. Se {{ $json.onboarding_etapa }} for vazio ou "concluido", não mencione onboarding nenhum.

Traduções de erro adicionais: SEM_CONSULTORIO_CADASTRADO -> "você ainda não tem nenhum consultório cadastrado"; CONSULTORIO_INVALIDO -> "não encontrei esse consultório"; NOME_OBRIGATORIO -> "preciso do nome pra continuar"; BANCO_OBRIGATORIO -> "preciso saber o banco pra continuar"; ONBOARDING_ETAPA_INVALIDA -> não mostre isso ao profissional, apenas siga com a etapa que o onboarding_etapa atual indica.
```

- [ ] **Step 4: Build/lint local (não há testes automatizados neste arquivo — é um script de provisionamento, não código do app Next.js)**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && node --check scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
```

Expected: nenhuma saída (sintaxe válida).

- [ ] **Step 5: Rodar o script e verificar via API**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
node scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
WFID=$(node -e "console.log(require('./scripts/n8n-agente-whatsapp/ids.json').workflows.agentPsicologo)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WFID" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const w = JSON.parse(d);
  const tools = w.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.toolHttpRequest');
  console.log('total de tools:', tools.length);
  console.log('novas presentes:', ['agent_criar_consultorio','agent_criar_paciente','agent_criar_conta_bancaria','agent_avancar_onboarding'].every(n => tools.some(t => t.name === n)));
  const trigger = w.nodes.find(n => n.name === 'Execute Workflow Trigger');
  console.log('inputs do trigger:', trigger.parameters.workflowInputs.values.map(v => v.name));
});
"
```

Expected: `total de tools: 20`, `novas presentes: true`, `inputs do trigger: [ 'whatsapp_number', 'mensagem_texto', 'usuario_nome', 'onboarding_etapa' ]`.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs && git commit -m "feat(whatsapp-agent): adiciona 4 tools de onboarding ao WA - Agent Psicólogo"
```

---

## Task 6: Extensão do `WA - Inbound Router`

**Files:**
- Modify: `scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs`

**Interfaces:**
- Consumes: `WA - Onboarding` (`ids.json.workflows.onboarding`, Task 4), `agent_sessions.onboarding_etapa`/`link_confirmacao_pendente`/`ultima_validacao_seguranca_em` (Fase 1), `POST /api/agent/onboarding` ação `revalidar` (Fase 1).
- Produces: `WA - Inbound Router` roteando número desconhecido (que não é código de 6 dígitos) pro `WA - Onboarding`, checando janela de 30 dias antes do fluxo normal, e passando `onboarding_etapa` pro `WA - Agent Psicólogo`.

- [ ] **Step 1: Estender a query de `Buscar Usuario Vinculado`**

Substituir o `query` desse nó:

```js
    {
      parameters: {
        operation: "executeQuery",
        query:
          "select\n  coalesce((select id::text from \"Usuarios\" where whatsapp_number = $1 and whatsapp_verified = true limit 1), '') as id,\n  (select nome from \"Usuarios\" where whatsapp_number = $1 and whatsapp_verified = true limit 1) as nome,\n  (select onboarding_etapa from agent_sessions where whatsapp_number = $1) as onboarding_etapa,\n  coalesce((select link_confirmacao_pendente from agent_sessions where whatsapp_number = $1), false) as link_confirmacao_pendente,\n  (select ultima_validacao_seguranca_em from agent_sessions where whatsapp_number = $1) as ultima_validacao_seguranca_em",
        options: {
          queryReplacement: "={{ [$json.numero_normalizado] }}",
        },
      },
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [880, 0],
      id: "b7c17000-0000-4000-8000-000000000006",
      name: "Buscar Usuario Vinculado",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
      onError: "continueErrorOutput",
    },
```

- [ ] **Step 2: Adicionar os nós novos de checagem de confirmação pendente e janela de 30 dias**

Adicionar estes 4 nós novos ao array `nodes` (depois do nó `Usuário encontrado?`, antes de `Bufferizar Mensagem`):

```js
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.link_confirmacao_pendente }}", rightValue: true, operator: { type: "boolean", operation: "true" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1100, 160],
      id: "b7c17000-0000-4000-8000-000000000030",
      name: "Confirmacao pendente?",
    },
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-000000000031",
      [1320, 160],
      "Enviar: aguardando confirmacao",
      "Ainda não confirmei seu cadastro — clica no link que te mandei por e-mail, ou me avisa se quer que eu reenvie."
    ),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.ultima_validacao_seguranca_em }}", rightValue: "", operator: { type: "string", operation: "notEmpty" } },
            { leftValue: "={{ $json.ultima_validacao_seguranca_em }}", rightValue: "={{ $now.minus({ days: 30 }) }}", operator: { type: "dateTime", operation: "before" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1100, 240],
      id: "b7c17000-0000-4000-8000-000000000032",
      name: "Precisa revalidar?",
    },
    {
      parameters: {
        method: "POST",
        url: "https://psiagente.com.br/api/agent/onboarding",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ '{\"acao\": \"revalidar\", \"whatsapp_number\": ' + JSON.stringify($('Normalizar Payload').item.json.numero_normalizado) + '}' }}",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [1320, 240],
      id: "b7c17000-0000-4000-8000-000000000033",
      name: "Disparar Revalidacao",
      credentials: {
        httpHeaderAuth: { id: credProxyId, name: "Agent Tool Secret - proxy Next.js" },
      },
      onError: "continueErrorOutput",
    },
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-000000000034",
      [1540, 240],
      "Enviar: revalidacao necessaria",
      "Faz um tempo que a gente não conversa — te mandei um link de confirmação por e-mail, clica nele pra continuar."
    ),
```

- [ ] **Step 3: Substituir o ramo "Parece código de 6 dígitos? → Não"**

Localize o nó `noEnviarMensagem(... "Enviar: instruções de vinculação" ...)` e **remova-o** — substitua pela chamada ao `WA - Onboarding`:

```js
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfOnboarding },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
            mensagem_texto: "={{ $('Normalizar Payload').item.json.texto }}",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1540, 160],
      id: "b7c17000-0000-4000-8000-000000000035",
      name: "Chamar WA - Onboarding",
      onError: "continueErrorOutput",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
            mensagem: "={{ $json.output }}",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1760, 160],
      id: "b7c17000-0000-4000-8000-000000000036",
      name: "Enviar: resposta do Onboarding",
    },
```

E no topo do arquivo, adicionar a leitura do id do workflow novo junto das outras:

```js
const wfOnboarding = ids.workflows.onboarding;
```

- [ ] **Step 4: Passar `onboarding_etapa` pro `WA - Agent Psicólogo`**

No nó `Chamar Agent Psicólogo`, adicionar ao `workflowInputs.value`:

```js
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfAgentPsicologo },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
            mensagem_texto: "={{ $json.mensagens.join('\\n') }}",
            usuario_nome: "={{ $('Buscar Usuario Vinculado').item.json.nome }}",
            onboarding_etapa: "={{ $('Buscar Usuario Vinculado').item.json.onboarding_etapa }}",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1980, -80],
      id: "b7c17000-0000-4000-8000-000000000008",
      name: "Chamar Agent Psicólogo",
      onError: "continueErrorOutput",
    },
```

- [ ] **Step 5: Atualizar as `connections`**

Adicionar/ajustar as conexões novas (a partir de `Usuário encontrado?` e a nova cadeia de checagens):

```js
    "Usuário encontrado?": {
      main: [
        [{ node: "Confirmacao pendente?", type: "main", index: 0 }],
        [{ node: "Parece código de 6 dígitos?", type: "main", index: 0 }],
      ],
    },
    "Confirmacao pendente?": {
      main: [
        [{ node: "Enviar: aguardando confirmacao", type: "main", index: 0 }],
        [{ node: "Precisa revalidar?", type: "main", index: 0 }],
      ],
    },
    "Precisa revalidar?": {
      main: [
        [{ node: "Disparar Revalidacao", type: "main", index: 0 }],
        [{ node: "Bufferizar Mensagem", type: "main", index: 0 }],
      ],
    },
    "Disparar Revalidacao": {
      main: [
        [{ node: "Enviar: revalidacao necessaria", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
    "Parece código de 6 dígitos?": {
      main: [
        [{ node: "Validar Código Vinculação", type: "main", index: 0 }],
        [{ node: "Chamar WA - Onboarding", type: "main", index: 0 }],
      ],
    },
    "Chamar WA - Onboarding": {
      main: [
        [{ node: "Enviar: resposta do Onboarding", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
```

(As demais conexões — `Webhook Evolution`, `Normalizar Payload`, `É mensagem nova de terceiro?`, `É mensagem de texto?`, `Bufferizar Mensagem`, `Esperar Mensagens Fragmentadas`, `Consumir Buffer`, `Chamar Agent Psicólogo`, `Validar Código Vinculação` — continuam exatamente como estão, sem mudança.)

- [ ] **Step 6: Sintaxe + rodar o script**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && node --check scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
node scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs
```

Expected: sem erro de sintaxe, `Workflow "WA - Inbound Router" atualizado, id=..., nós=...` (mais 8 nós que antes: 4 da checagem de revalidação + 2 do redirecionamento pro Onboarding, líquido de -1 pelo nó removido).

- [ ] **Step 7: Verificar via API**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
WFID=$(node -e "console.log(require('./scripts/n8n-agente-whatsapp/ids.json').workflows.inboundRouter)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WFID" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const w = JSON.parse(d);
  console.log('nos:', w.nodes.map(n => n.name));
  console.log('tem Enviar: instruções de vinculação (esperado false):', w.nodes.some(n => n.name === 'Enviar: instruções de vinculação'));
});
"
```

Expected: lista de nós inclui `Confirmacao pendente?`, `Precisa revalidar?`, `Disparar Revalidacao`, `Chamar WA - Onboarding`; `Enviar: instruções de vinculação` não existe mais.

- [ ] **Step 8: Commit**

```bash
git add scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs && git commit -m "feat(whatsapp-agent): Router diferencia cadastro novo e checa janela de revalidação"
```

---

## Task 7: Ativar `WA - Onboarding` e configurar o webhook de confirmação

**Files:**
- Create: `scripts/n8n-agente-whatsapp/07-ativar-onboarding.mjs`

**Interfaces:**
- Consumes: `ids.json.workflows.onboarding` (Task 4).
- Produces: workflow `WA - Onboarding` ativado; imprime a URL completa do webhook de confirmação (`$N8N_BASE_URL/webhook/wa-onboarding-confirmacao-f3a91c7d0e2b4a68`), que precisa virar `N8N_ONBOARDING_CONTINUE_URL` no EasyPanel do app (documentado na Task 8, configuração manual fora do escopo deste script).

- [ ] **Step 1: Escrever o script**

```js
// scripts/n8n-agente-whatsapp/07-ativar-onboarding.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { onboarding } = ids.workflows;

if (!onboarding) {
  console.error("ids.json não tem workflows.onboarding — rode 06-workflow-onboarding.mjs primeiro.");
  process.exit(1);
}

await n8nRequest("POST", `/workflows/${onboarding}/activate`, {});
console.log(`Workflow "WA - Onboarding" (${onboarding}) ativado.`);

const webhookPath = "wa-onboarding-confirmacao-f3a91c7d0e2b4a68";
const url = `${process.env.N8N_BASE_URL}/webhook/${webhookPath}`;
console.log(`\nConfigurar no EasyPanel do app (serviço psifacil_psifacil), env var:\n  N8N_ONBOARDING_CONTINUE_URL=${url}\n  N8N_ONBOARDING_SECRET=<mesmo valor gerado na Task 3, ver scratchpad>\n\nAmbas exigem restart do container pra valer (lidas só em runtime).`);
```

- [ ] **Step 2: Rodar o script**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
node scripts/n8n-agente-whatsapp/07-ativar-onboarding.mjs
```

Expected: `Workflow "WA - Onboarding" (...) ativado.` seguido das instruções de env var pro EasyPanel.

- [ ] **Step 3: Verificar via API que está ativo**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\7c1b8503-5548-44d9-8796-01db1ccae5d3\scratchpad\n8n-session.env"
WFID=$(node -e "console.log(require('./scripts/n8n-agente-whatsapp/ids.json').workflows.onboarding)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WFID" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log('ativo:', JSON.parse(d).active));"
```

Expected: `ativo: true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/07-ativar-onboarding.mjs && git commit -m "feat(whatsapp-agent): script pra ativar WA - Onboarding"
```

---

## Task 8: Documentação — `docs/status-implementacao.md`

**Files:**
- Modify: `docs/status-implementacao.md`

- [ ] **Step 1: Adicionar seção nova no topo do arquivo**

```markdown
## Início de operação via WhatsApp — Fase 2/n8n (2026-09-08)

Implementado o plano `docs/superpowers/plans/2026-09-08-inicio-operacao-whatsapp-fase2-n8n.md`
(spec `docs/superpowers/specs/2026-09-08-inicio-operacao-whatsapp-fase2-n8n-design.md`):
RPC nova `agent_avancar_onboarding` (fecha lacuna da Fase 1 — nada
avançava `onboarding_etapa`), workflow novo `WA - Onboarding` (2
gatilhos: conversa de cadastro + confirmação de link mágico), `WA -
Inbound Router` estendido (diferenciação "já tenho conta"/"conta nova"
por linguagem natural + janela de revalidação de 30 dias), `WA - Agent
Psicólogo` com 4 tools novas e onboarding guiado condicional no system
prompt (20 tools no total).

- **Env vars novas no EasyPanel do app** (serviço `psifacil_psifacil`,
  ainda não configuradas — pendente, manual): `N8N_ONBOARDING_SECRET`
  (gerado durante a Task 3 do plano) e `N8N_ONBOARDING_CONTINUE_URL`
  (impressa pela Task 7 do plano, formato
  `https://psifacil-n8n.lcuzxl.easypanel.host/webhook/wa-onboarding-confirmacao-...`).
  Sem elas, `continuarFluxoWhatsapp` (Fase 1) loga o erro e não quebra
  login normal, mas o clique do link mágico nunca acorda o
  `WA - Onboarding`.
- **`ultima_validacao_seguranca_em` nula é tratada como isenta** da
  janela de 30 dias — todo profissional já vinculado antes desta
  entrega não é afetado até a primeira validação real.
- **Bloqueadores conhecidos pro teste de ponta a ponta** (não é código
  quebrado, é estado de infra — ver seção "Início de operação via
  WhatsApp — backend" mais abaixo pro histórico completo):
  1. **Produção não tem o código da Fase 1 nem da Fase 2** — precisa de
     clique manual "Deploy" no EasyPanel.
  2. **SMTP do Supabase Auth instável** — `signInWithOtp` retornando
     500 na última checagem (2026-09-08), credenciais/config
     confirmadas corretas, causa raiz na plataforma Supabase.
  Os 3 workflows n8n estão construídos e ativados independente disso —
  só o teste real (criar conta → e-mail chega → clica → onboarding
  guiado) fica pendente até os dois itens acima resolverem.
- **Falta pra fechar a entrega**: configurar as 2 env vars acima no
  EasyPanel, pedir o deploy, confirmar SMTP, rodar o teste de ponta a
  ponta real com um número de WhatsApp de teste.
```

- [ ] **Step 2: Commit**

```bash
git add docs/status-implementacao.md && git commit -m "docs: registra Fase 2 (n8n) do início de operação via WhatsApp"
```

---

## Task 9 (bloqueada — não executar até os pré-requisitos existirem): Verificação de ponta a ponta

**Não é uma task normal do fluxo de execução** — depende de dois itens fora do controle deste plano (deploy manual no EasyPanel, SMTP do Supabase Auth voltando a funcionar). Deixar marcada como pendente entre sessões; quando os dois pré-requisitos estiverem resolvidos, executar manualmente (não script, é teste real com WhatsApp):

1. Confirmar `N8N_ONBOARDING_SECRET`/`N8N_ONBOARDING_CONTINUE_URL` configuradas no EasyPanel e o container reiniciado.
2. Mandar mensagem de um número de WhatsApp de teste real (não vinculado) dizendo algo como "oi, quero começar a usar" → confirmar que o `WA - Onboarding` responde perguntando se já tem conta.
3. Responder "é a primeira vez" → fornecer nome e e-mail → confirmar que o e-mail com o link chega de verdade.
4. Clicar o link → confirmar que a próxima mensagem no WhatsApp já é o início do onboarding guiado ("qual o nome do consultório?").
5. Passar pelas 3 etapas (criando consultório e paciente, pulando a conta bancária, por exemplo) → confirmar a mensagem final de resumo.
6. Forçar `agent_sessions.ultima_validacao_seguranca_em` desse número de teste pra 31 dias atrás via script direto → mandar mensagem → confirmar que pede revalidação → clicar o link de revalidação → confirmar que libera sem repetir o onboarding.
7. Testar "já tenho conta" de outro número desconhecido → confirmar que orienta o código de 6 dígitos, sem tocar o `WA - Onboarding`.
8. Conferir `agent_audit_log` com linhas de todas as tools novas chamadas durante o teste.
9. Limpar todos os dados de teste (Usuarios, agent_sessions, Consultorio/Paciente/ContaFinanceira criados, Auth user).

---

## Self-Review

**Cobertura da spec**: addendum `agent_avancar_onboarding` (Task 1-2), diferenciação por linguagem natural (Task 6), janela de 30 dias com tratamento de nulo (Task 6), `WA - Onboarding` com 2 gatilhos (Task 4), onboarding guiado no Agent Psicólogo (Task 5), credencial/segredo novo (Task 3), sequenciamento documentado (Task 8-9). Nada da spec ficou sem task correspondente.

**Placeholder scan**: nenhum "TBD"/"implementar depois" — toda task tem código completo, inclusive os 3 novos scripts `.mjs` por inteiro. A Task 9 é deliberadamente bloqueada (não um placeholder — é um passo real, documentado, que só pode rodar quando dependências externas existirem).

**Consistência de tipos/nomes**: `agent_avancar_onboarding(p_whatsapp_number, p_etapa_atual)` usado identicamente nas Tasks 1, 2 e 5. `onboarding_etapa` como nome de campo idêntico nas Tasks 5 (input do trigger) e 6 (quem preenche esse input). Nomes de nó (`Chamar WA - Onboarding`, `Confirmacao pendente?`, `Precisa revalidar?`) usados de forma consistente entre as `connections` e a lista de `nodes` na Task 6. `wfOnboarding` (variável nova no topo do script da Task 6) referenciado corretamente no nó `Chamar WA - Onboarding`.
