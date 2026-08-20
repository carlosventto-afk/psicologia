# Agente de WhatsApp — workflow n8n (item 13, metade 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir e ativar os 3 workflows n8n (Router, Agent, Enviar Mensagem) que ligam o WhatsApp (via Evolution API) às 18 RPC tools já em produção através da rota proxy `/api/agent/call-tool`, fechando o item 13.

**Architecture:** 3 workflows n8n independentes, criados via chamadas `POST`/`GET`/`PATCH` na API REST pública do n8n (`/api/v1/...`), scriptadas em Node (mesmo padrão dos scripts existentes em `scripts/*.mjs`). `WA - Enviar Mensagem` é um sub-workflow reutilizável chamado via nó Execute Workflow. `WA - Inbound Router` recebe o webhook da Evolution API, identifica o remetente e decide entre o fluxo de vinculação por código e o encaminhamento pro Agent. `WA - Agent Psicólogo` é um nó AI Agent nativo do n8n (Gemini 3.5 Flash-Lite + memória Postgres + 18 tools HTTP).

**Tech Stack:** n8n 2.21.0 self-hosted (API REST pública, autenticação `X-N8N-API-KEY`), Node.js 24 (scripts `.mjs`, sem dependências novas), Evolution API v2.3.7 self-hosted (instância `psifacil`), Google Gemini API (`gemini-3.5-flash-lite`), Supabase Postgres (conexão direta, role `postgres`).

**Spec:** `docs/superpowers/specs/2026-08-19-agente-whatsapp-workflow-n8n-design.md` (e, para o catálogo completo de tools/erros das 5 RPCs novas, `docs/superpowers/specs/2026-08-17-agente-whatsapp-profissional-design.md`)

## Global Constraints

- **n8n**: `N8N_BASE_URL=https://psifacil-n8n.lcuzxl.easypanel.host`, autenticação via header `X-N8N-API-KEY: <valor>`. Versão confirmada rodando: `2.21.0`.
- **Credenciais de execução dos scripts nunca vão pro repositório.** `N8N_API_KEY`, `N8N_BASE_URL` e `GEMINI_API_KEY` já estão salvas em `C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env` (fora do repo) — sempre `source` esse arquivo antes de rodar qualquer script deste plano. Os scripts em si só leem `process.env.*`, nunca hardcodeiam segredo.
- **Segredos que vivem só na VPS** (nunca colados em arquivo, nunca impressos em log/terminal além do necessário para uso imediato): `AGENT_TOOL_SECRET` e `CARNE_LEAO_CRON_SECRET` estão no serviço `psifacil_psifacil`; `AUTHENTICATION_API_KEY` da Evolution API está no serviço `psifacil_evolution-api`. Buscar via SSH (`ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130`) e exportar direto pro shell que vai rodar o script Node — nunca escrever em arquivo dentro do repo.
- **Supabase — conexão Postgres direta** (usada só pela credencial do n8n, não pelos scripts de provisionamento): host `db.rohulajgyxdangxfurha.supabase.co`, porta `5432`, database `postgres`, user `postgres`, senha em `$SUPABASE_DB_PASSWORD` (já presente no perfil do shell), `ssl: require`.
- **Evolution API**: `EVOLUTION_BASE_URL=https://psifacil-evolution-api.lcuzxl.easypanel.host`, instância `psifacil` (confirmada via `GET /instance/fetchInstances`; nome não muda ao longo deste plano). **Status da conexão no momento em que este plano foi escrito: `close` (desconectada)** — reconectar (escanear QR code) é ação humana, fora do alcance de qualquer script; sinalizado explicitamente na Task 6.
- **Proxy Next.js já em produção**: `POST https://psiagente.com.br/api/agent/call-tool`, header `x-agent-secret: <AGENT_TOOL_SECRET>`, body `{tool_name, whatsapp_number, params}`. Lista fechada de 18 tools válidas (`web/app/api/agent/call-tool/route.js`): `agent_listar_consultorios`, `agent_buscar_paciente`, `agent_get_agenda`, `agent_status_pagamento_paciente`, `agent_listar_debitos_paciente`, `agent_registrar_pagamento_sessao`, `agent_marcar_atendimento_realizado`, `agent_agendar_sessao_avulsa`, `agent_cancelar_sessao`, `agent_gerar_recibo`, `agent_listar_inadimplentes`, `agent_resumo_financeiro`, `agent_reagendar_sessao`, `agent_excluir_sessao`, `agent_excluir_pagamento`, `agent_registrar_lancamento_despesa`, `agent_registrar_anamnese`, `agent_definir_consultorio_ativo`.
- **Assinaturas exatas das 18 tools** (confirmadas via `pg_proc` em produção em 2026-08-19 — usar exatamente estes nomes de parâmetro em todo `$fromAI(...)`):
  - `agent_listar_consultorios(p_whatsapp_number)` → `{id, nome}[]`
  - `agent_buscar_paciente(p_whatsapp_number, p_nome, p_consultorio_id?)` → `{id, nome, similaridade}[]`
  - `agent_get_agenda(p_whatsapp_number, p_data_inicio date, p_data_fim date, p_consultorio_id?)` → `{sessao_id, paciente_nome, data, horario, duracao_min, status, realizado}[]`
  - `agent_status_pagamento_paciente(p_whatsapp_number, p_paciente_id, p_consultorio_id?)` → `{sessao_id, data, valor_sessao, pago, valor_pago, forma_pagamento}[]`
  - `agent_listar_debitos_paciente(p_whatsapp_number, p_paciente_id, p_consultorio_id?)` → `{sessao_id, data, valor_devido}[]`
  - `agent_registrar_pagamento_sessao(p_whatsapp_number, p_sessao_id, p_valor numeric, p_forma_pagamento text, p_conta_id bigint, p_consultorio_id?)` → `jsonb`
  - `agent_marcar_atendimento_realizado(p_whatsapp_number, p_sessao_id, p_anotacoes text?, p_consultorio_id?)` → `boolean`
  - `agent_agendar_sessao_avulsa(p_whatsapp_number, p_paciente_id, p_data date, p_horario time, p_duracao_min numeric = 50, p_consultorio_id?)` → `bigint`
  - `agent_cancelar_sessao(p_whatsapp_number, p_sessao_id, p_consultorio_id?)` → `boolean`
  - `agent_gerar_recibo(p_whatsapp_number, p_sessao_id, p_consultorio_id?)` → `bigint`
  - `agent_listar_inadimplentes(p_whatsapp_number, p_consultorio_id?)` → `{paciente_id, paciente_nome, sessao_id, data, valor_devido}[]`
  - `agent_resumo_financeiro(p_whatsapp_number, p_data_inicio date, p_data_fim date, p_consultorio_id?)` → `jsonb`
  - `agent_reagendar_sessao(p_whatsapp_number, p_sessao_id, p_data_nova date, p_horario_novo time, p_consultorio_id?)` → `jsonb {sessao_id, reagendamentos_mes_atual, alerta}`
  - `agent_excluir_sessao(p_whatsapp_number, p_sessao_id, p_consultorio_id?)` → `boolean`
  - `agent_excluir_pagamento(p_whatsapp_number, p_pagamento_id, p_consultorio_id?)` → `boolean`
  - `agent_registrar_lancamento_despesa(p_whatsapp_number, p_descricao text, p_valor numeric, p_data date = hoje, p_conta_id?, p_consultorio_id?)` → `bigint`
  - `agent_registrar_anamnese(p_whatsapp_number, p_paciente_id, p_campos jsonb = {}, p_observacao text?, p_consultorio_id?)` → `jsonb {anamnese_id, alteracoes}`
  - `agent_definir_consultorio_ativo(p_whatsapp_number, p_consultorio_id)` → `boolean`
  - Todo parâmetro `p_consultorio_id` é **opcional** e nunca deve ser preenchido pelo LLM a não ser que o protocolo `CONSULTORIO_AMBIGUO` já tenha rodado — não faz parte do `$fromAI` de nenhuma tool.
- **Catálogo de erros a traduzir no system prompt do Agent** (nunca mostrar o código cru): `WHATSAPP_NAO_VINCULADO`, `CONSULTORIO_INVALIDO`, `CONSULTORIO_AMBIGUO`, `SEM_CONSULTORIO_CADASTRADO`, `SESSAO_NAO_ENCONTRADA`, `PACIENTE_INVALIDO`, `SESSAO_NAO_REAGENDAVEL`, `SESSAO_TEM_VINCULO_FINANCEIRO`, `PAGAMENTO_NAO_ENCONTRADO`, `PAGAMENTO_TEM_NOTA_FISCAL`, `CONTA_INVALIDA`, `CAMPO_ANAMNESE_INVALIDO`, `CAMPOS_INVALIDOS`, `TOOL_DESCONHECIDA`, `WHATSAPP_NUMBER_AUSENTE`.
- **`validar_codigo_whatsapp(p_whatsapp_number text, p_codigo text) returns jsonb`** — RPC `service_role`, chamada direto via SQL pelo nó Postgres do Router (não passa pelo proxy, não está na lista de 18 tools). Sucesso retorna `{usuario_id, nome}`; código inválido/expirado levanta `CODIGO_INVALIDO`.
- **Schema `"Usuarios"`**: colunas relevantes `id bigint`, `nome text`, `whatsapp_number text`, `whatsapp_verified boolean`.
- **Casing:** `Sessao.status` é `'Marcada'`/`'Realizada'`/`'Cancelada'`, `LancamentoFinanceiro.tipo` é `'Receita'`/`'Despesa'` — só relevante se algum texto de resposta do agente citar esses valores literalmente; nunca usar minúsculo.
- **Sem framework de teste automatizado** (convenção já estabelecida no projeto) — toda verificação é script direto + inspeção via API/SQL.
- **Nós exóticos (AI Agent, Chat Model, Memory, Tool) não têm endpoint de introspecção de schema acessível via API key** (`/types/nodes.json` retorna 401, exige sessão de UI) — os tipos/versões usados nas tasks abaixo são a melhor estimativa a partir de conhecimento de treinamento, não uma certeza absoluta. Cada task que cria esses nós tem passo explícito de "buscar de volta via GET e comparar", e a Task 3 (a mais arriscada) tem passo adicional de verificação visual. Um erro de schema aqui é esperado como uma iteração normal, não motivo para travar — ajustar o JSON a partir da mensagem de erro real da API e tentar de novo.
- **Tipo de nó confirmado ao vivo nesta instância** (via `GET` do workflow existente `t3hBXXtjn2aH6LYK`, "My workflow" — que na verdade já é a automação do item 9/Carnê-Leão, criada fora deste plano, inativa, fora de escopo tocar): `n8n-nodes-base.httpRequest` typeVersion `4.4`, `n8n-nodes-base.scheduleTrigger` typeVersion `1.3`. Usar `4.4` em todo nó HTTP Request criado neste plano.
- **Estrutura de credencial no nó**: `credentials: { "<tipo>": { "id": "<id>", "name": "<nome>" } }`, igual ao padrão confirmado no workflow existente (`credentials: {"smtp": {"id": "...", "name": "SMTP account"}}`).

---

## Arquivos deste plano

Todos os scripts são de **provisionamento único** (rodados uma vez para criar/configurar recursos vivos no n8n e na Evolution API) — não fazem parte do runtime da aplicação, mas ficam versionados no repo por instrução do usuário ("nada fora do repo").

- Criar: `scripts/n8n-agente-whatsapp/lib.mjs` — helper HTTP compartilhado (`n8nRequest`, `evolutionRequest`).
- Criar: `scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs`
- Criar: `scripts/n8n-agente-whatsapp/02-workflow-enviar-mensagem.mjs`
- Criar: `scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs`
- Criar: `scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs`
- Criar: `scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs`
- Criar: `scripts/n8n-agente-whatsapp/ids.json` — gerado pelos scripts acima (não é segredo — só ids de credencial/workflow), lido pelas tasks seguintes.
- Modificar: `docs/backlog-novas-funcionalidades.md` — marcar item 13 como concluído.
- Modificar: `docs/status-implementacao.md` — documentar os 3 workflows e a config do webhook.

---

### Task 1: Script helper + 4 credenciais no n8n

**Files:**
- Create: `scripts/n8n-agente-whatsapp/lib.mjs`
- Create: `scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs`

**Interfaces:**
- Produces: `lib.mjs` exporta `async function n8nRequest(method, path, body)` (retorna JSON já parseado, lança erro com `status` + corpo da resposta se `!res.ok`) e `async function evolutionRequest(method, path, body)` (mesma forma, contra `EVOLUTION_BASE_URL` com header `apikey`). Tasks 2-5 importam essas duas funções.
- Produces: `scripts/n8n-agente-whatsapp/ids.json` com o formato `{"credenciais": {"postgres": "<id>", "gemini": "<id>", "proxySecret": "<id>", "evolutionApiKey": "<id>"}}` — Tasks 2-4 leem esse arquivo pra referenciar credenciais nos nós.
- Consumes: variáveis de ambiente `N8N_API_KEY`, `N8N_BASE_URL` (do arquivo scratch), e `AGENT_TOOL_SECRET`, `EVOLUTION_API_KEY`, `SUPABASE_DB_PASSWORD`, `GEMINI_API_KEY` (buscadas via SSH/perfil do shell antes de rodar — ver passo 3 abaixo).

- [ ] **Step 1: Criar `lib.mjs`**

```js
// scripts/n8n-agente-whatsapp/lib.mjs
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;
const EVOLUTION_BASE_URL = process.env.EVOLUTION_BASE_URL || "https://psifacil-evolution-api.lcuzxl.easypanel.host";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

export async function n8nRequest(method, path, body) {
  if (!N8N_BASE_URL || !N8N_API_KEY) {
    throw new Error("Defina N8N_BASE_URL e N8N_API_KEY antes de rodar (source do arquivo scratch).");
  }
  const res = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { rawText: texto };
  }
  if (!res.ok) {
    const erro = new Error(`n8n API ${method} ${path} -> ${res.status}`);
    erro.status = res.status;
    erro.body = json;
    throw erro;
  }
  return json;
}

export async function evolutionRequest(method, path, body) {
  if (!EVOLUTION_API_KEY) {
    throw new Error("Defina EVOLUTION_API_KEY antes de rodar.");
  }
  const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    method,
    headers: {
      apikey: EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { rawText: texto };
  }
  if (!res.ok) {
    const erro = new Error(`Evolution API ${method} ${path} -> ${res.status}`);
    erro.status = res.status;
    erro.body = json;
    throw erro;
  }
  return json;
}
```

- [ ] **Step 2: Criar `01-criar-credenciais.mjs`**

```js
// scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const obrigatorias = ["AGENT_TOOL_SECRET", "EVOLUTION_API_KEY", "SUPABASE_DB_PASSWORD", "GEMINI_API_KEY"];
for (const nome of obrigatorias) {
  if (!process.env[nome]) {
    console.error(`Defina ${nome} no ambiente antes de rodar este script.`);
    process.exit(1);
  }
}

const credenciais = [
  {
    chave: "postgres",
    payload: {
      name: "Supabase - psiagente (direct DB)",
      type: "postgres",
      data: {
        host: "db.rohulajgyxdangxfurha.supabase.co",
        database: "postgres",
        user: "postgres",
        password: process.env.SUPABASE_DB_PASSWORD,
        port: 5432,
        ssl: "require",
      },
    },
  },
  {
    chave: "gemini",
    payload: {
      name: "Google Gemini - agente WhatsApp",
      type: "googlePalmApi",
      data: {
        host: "https://generativelanguage.googleapis.com",
        apiKey: process.env.GEMINI_API_KEY,
      },
    },
  },
  {
    chave: "proxySecret",
    payload: {
      name: "Agent Tool Secret - proxy Next.js",
      type: "httpHeaderAuth",
      data: { name: "x-agent-secret", value: process.env.AGENT_TOOL_SECRET },
    },
  },
  {
    chave: "evolutionApiKey",
    payload: {
      name: "Evolution API - psifacil",
      type: "httpHeaderAuth",
      data: { name: "apikey", value: process.env.EVOLUTION_API_KEY },
    },
  },
];

const ids = {};
for (const { chave, payload } of credenciais) {
  const criado = await n8nRequest("POST", "/credentials", payload);
  ids[chave] = criado.id;
  console.log(`Credencial "${payload.name}" criada, id=${criado.id}`);
}

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const atual = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, "utf8")) : {};
atual.credenciais = ids;
fs.writeFileSync(idsPath, JSON.stringify(atual, null, 2));
console.log(`Gravado em ${idsPath}`);
```

- [ ] **Step 3: Buscar os segredos via SSH e rodar o script**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
export AGENT_TOOL_SECRET=$(ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130 "docker service inspect psifacil_psifacil --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'" | grep '^AGENT_TOOL_SECRET=' | cut -d= -f2-)
export EVOLUTION_API_KEY=$(ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130 "docker service inspect psifacil_evolution-api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'" | grep '^AUTHENTICATION_API_KEY=' | cut -d= -f2-)
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
node scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs
```

Expected: 4 linhas "Credencial ... criada, id=...", e `scripts/n8n-agente-whatsapp/ids.json` criado com os 4 ids.

- [ ] **Step 4: Verificar via GET**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/credentials?limit=50" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const items=j.data||j;for(const c of items) console.log(c.id, c.name, c.type);});"
```

Expected: as 4 credenciais criadas aparecem na lista, com o `type` correto cada uma (`postgres`, `googlePalmApi`, `httpHeaderAuth` x2). A API do n8n não retorna o campo `data` (segredo mascarado) — isso é esperado, não é falha.

- [ ] **Step 5: Commit**

```bash
git add scripts/n8n-agente-whatsapp/lib.mjs scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs scripts/n8n-agente-whatsapp/ids.json
git commit -m "feat: cria credenciais n8n do agente de WhatsApp (postgres, gemini, proxy, evolution)"
```

(`ids.json` não contém segredo — só ids de credencial, seguros de versionar, iguais ao padrão de log de scripts existentes.)

---

### Task 2: Workflow "WA - Enviar Mensagem"

**Files:**
- Create: `scripts/n8n-agente-whatsapp/02-workflow-enviar-mensagem.mjs`

**Interfaces:**
- Consumes: `ids.json.credenciais.evolutionApiKey` (Task 1).
- Produces: `ids.json.workflows.enviarMensagem` (id do workflow) — consumido pelas Tasks 3 e 4, que chamam este workflow via nó Execute Workflow passando `{whatsapp_number, mensagem}`.
- Consumes/Produces contrato do sub-workflow: entrada `{whatsapp_number: string, mensagem: string}`, saída = resposta HTTP da Evolution API (não usada pelos chamadores, só o efeito colateral de enviar a mensagem importa).

- [ ] **Step 1: Criar o script**

```js
// scripts/n8n-agente-whatsapp/02-workflow-enviar-mensagem.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const credEvolutionId = ids.credenciais.evolutionApiKey;

const workflow = {
  name: "WA - Enviar Mensagem",
  nodes: [
    {
      parameters: {
        workflowInputs: {
          values: [
            { name: "whatsapp_number" },
            { name: "mensagem" },
          ],
        },
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      id: "e1f1a001-0000-4000-8000-000000000001",
      name: "Execute Workflow Trigger",
    },
    {
      parameters: {
        method: "POST",
        url: `=https://psifacil-evolution-api.lcuzxl.easypanel.host/message/sendText/psifacil`,
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ { \"number\": $json.whatsapp_number, \"text\": $json.mensagem } }}",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [240, 0],
      id: "e1f1a001-0000-4000-8000-000000000002",
      name: "Enviar via Evolution API",
      credentials: {
        httpHeaderAuth: { id: credEvolutionId, name: "Evolution API - psifacil" },
      },
    },
  ],
  connections: {
    "Execute Workflow Trigger": {
      main: [[{ node: "Enviar via Evolution API", type: "main", index: 0 }]],
    },
  },
  settings: { executionOrder: "v1" },
};

const criado = await n8nRequest("POST", "/workflows", workflow);
console.log(`Workflow "WA - Enviar Mensagem" criado, id=${criado.id}`);

ids.workflows = ids.workflows || {};
ids.workflows.enviarMensagem = criado.id;
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
```

- [ ] **Step 2: Rodar**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
node scripts/n8n-agente-whatsapp/02-workflow-enviar-mensagem.mjs
```

Expected: `Workflow "WA - Enviar Mensagem" criado, id=...` e `ids.json` ganha a chave `workflows.enviarMensagem`.

- [ ] **Step 3: Verificar via GET — buscar de volta e conferir 2 nós**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/n8n-agente-whatsapp/ids.json','utf8')).workflows.enviarMensagem)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WF_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const wf=JSON.parse(d);console.log('nodeCount:', wf.nodes.length);for(const n of wf.nodes) console.log(' -', n.name, n.type, n.typeVersion);});"
```

Expected: `nodeCount: 2`, com os nomes/tipos exatos escritos no script. Se a API do n8n tiver rejeitado/normalizado algum campo (por exemplo `typeVersion` do `executeWorkflowTrigger` ou o shape de `workflowInputs`), o erro aparece no `POST` do Step 2 — ajustar o JSON a partir da mensagem de erro real e repetir Steps 1-3 até passar, conforme a Global Constraint sobre nós sem introspecção de schema.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/02-workflow-enviar-mensagem.mjs scripts/n8n-agente-whatsapp/ids.json
git commit -m "feat: cria workflow n8n WA - Enviar Mensagem"
```

---

### Task 3: Workflow "WA - Agent Psicólogo"

**Files:**
- Create: `scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs`

**Interfaces:**
- Consumes: `ids.json.credenciais.postgres`, `.gemini`, `.proxySecret` (Task 1).
- Produces: `ids.json.workflows.agentPsicologo` (id) — consumido pela Task 4 (Router chama este workflow via Execute Workflow passando `{whatsapp_number, mensagem_texto, usuario_nome}` e lê `output` da resposta).
- Contrato de entrada: `{whatsapp_number: string, mensagem_texto: string, usuario_nome: string}`. Contrato de saída (nó AI Agent): campo `output` com o texto de resposta pronto pra enviar ao profissional.

Este é o workflow de maior risco de schema (nó AI Agent + Chat Model + Memory + 18 Tools, ver Global Constraints). O script constrói os 18 nós de tool a partir de uma tabela de dados (não são 18 blocos de JSON escritos à mão — são gerados por um loop a partir da assinatura real de cada RPC, copiada das Global Constraints).

- [ ] **Step 1: Criar o script**

```js
// scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { postgres: credPostgresId, gemini: credGeminiId, proxySecret: credProxyId } = ids.credenciais;

// Catálogo das 18 tools: nome do parâmetro, tipo pro $fromAI, descrição pro Gemini.
// Copiado das Global Constraints do plano (assinaturas confirmadas via pg_proc em produção).
const tools = [
  {
    nome: "agent_listar_consultorios",
    descricao: "Lista os consultórios do profissional. Use para descobrir o id de um consultório, ou quando a tool anterior falhar com CONSULTORIO_AMBIGUO.",
    params: [],
  },
  {
    nome: "agent_definir_consultorio_ativo",
    descricao: "Define qual consultório fica ativo para as próximas mensagens desta conversa. Chame depois de agent_listar_consultorios quando o profissional escolher um, em resposta a CONSULTORIO_AMBIGUO.",
    params: [{ nome: "p_consultorio_id", tipo: "number", desc: "Id do consultório escolhido pelo profissional." }],
  },
  {
    nome: "agent_buscar_paciente",
    descricao: "Busca pacientes pelo nome (busca aproximada). Use para descobrir o id de um paciente antes de agendar, consultar débitos, etc.",
    params: [{ nome: "p_nome", tipo: "string", desc: "Nome ou parte do nome do paciente." }],
  },
  {
    nome: "agent_get_agenda",
    descricao: "Lista os atendimentos agendados em um período. Use para responder perguntas sobre a agenda (hoje, amanhã, esta semana, etc).",
    params: [
      { nome: "p_data_inicio", tipo: "string", desc: "Data inicial no formato YYYY-MM-DD." },
      { nome: "p_data_fim", tipo: "string", desc: "Data final no formato YYYY-MM-DD (pode ser igual à inicial para um único dia)." },
    ],
  },
  {
    nome: "agent_status_pagamento_paciente",
    descricao: "Lista as sessões de um paciente com o status de pagamento de cada uma.",
    params: [{ nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." }],
  },
  {
    nome: "agent_listar_debitos_paciente",
    descricao: "Lista as sessões em aberto (não pagas) de um paciente específico.",
    params: [{ nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." }],
  },
  {
    nome: "agent_registrar_pagamento_sessao",
    descricao: "Registra o pagamento de uma sessão específica.",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão que está sendo paga." },
      { nome: "p_valor", tipo: "number", desc: "Valor pago, em reais." },
      { nome: "p_forma_pagamento", tipo: "string", desc: "Forma de pagamento (ex: pix, dinheiro, cartão)." },
      { nome: "p_conta_id", tipo: "number", desc: "Id da conta financeira que recebeu o pagamento." },
    ],
  },
  {
    nome: "agent_marcar_atendimento_realizado",
    descricao: "Marca uma sessão como realizada (atendimento aconteceu).",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão." },
      { nome: "p_anotacoes", tipo: "string", desc: "Anotações opcionais sobre o atendimento (pode ser vazio)." },
    ],
  },
  {
    nome: "agent_agendar_sessao_avulsa",
    descricao: "Cria um novo agendamento avulso para um paciente.",
    params: [
      { nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." },
      { nome: "p_data", tipo: "string", desc: "Data do atendimento no formato YYYY-MM-DD." },
      { nome: "p_horario", tipo: "string", desc: "Horário no formato HH:MM." },
      { nome: "p_duracao_min", tipo: "number", desc: "Duração em minutos. Se o profissional não falar, use 50." },
    ],
  },
  {
    nome: "agent_cancelar_sessao",
    descricao: "Cancela uma sessão (não substitui por outra data — para isso use agent_reagendar_sessao). SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a cancelar." }],
  },
  {
    nome: "agent_reagendar_sessao",
    descricao: "Muda a data/hora de uma sessão existente para outra data/hora, mantendo o mesmo atendimento (diferente de cancelar). Se o resultado trouxer alerta=true, avise o profissional que este paciente já remarcou muitas vezes neste mês.",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a reagendar." },
      { nome: "p_data_nova", tipo: "string", desc: "Nova data no formato YYYY-MM-DD." },
      { nome: "p_horario_novo", tipo: "string", desc: "Novo horário no formato HH:MM." },
    ],
  },
  {
    nome: "agent_excluir_sessao",
    descricao: "Exclui definitivamente uma sessão (diferente de cancelar). Só funciona se a sessão não tiver pagamento/recibo vinculado. SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a excluir." }],
  },
  {
    nome: "agent_gerar_recibo",
    descricao: "Gera um recibo para uma sessão.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão." }],
  },
  {
    nome: "agent_excluir_pagamento",
    descricao: "Exclui (desfaz) um pagamento já registrado, fazendo a sessão voltar a aparecer como não paga. SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_pagamento_id", tipo: "number", desc: "Id do pagamento a excluir." }],
  },
  {
    nome: "agent_registrar_lancamento_despesa",
    descricao: "Registra uma despesa financeira (não é uma sessão).",
    params: [
      { nome: "p_descricao", tipo: "string", desc: "Descrição da despesa." },
      { nome: "p_valor", tipo: "number", desc: "Valor da despesa, em reais." },
      { nome: "p_data", tipo: "string", desc: "Data da despesa no formato YYYY-MM-DD. Se o profissional não falar, use hoje." },
    ],
  },
  {
    nome: "agent_listar_inadimplentes",
    descricao: "Lista todos os pacientes com sessões em aberto (não pagas).",
    params: [],
  },
  {
    nome: "agent_resumo_financeiro",
    descricao: "Resumo financeiro (receitas/despesas) em um período.",
    params: [
      { nome: "p_data_inicio", tipo: "string", desc: "Data inicial no formato YYYY-MM-DD." },
      { nome: "p_data_fim", tipo: "string", desc: "Data final no formato YYYY-MM-DD." },
    ],
  },
  {
    nome: "agent_registrar_anamnese",
    descricao: "Preenche ou atualiza campos da anamnese de um paciente. Chaves válidas em p_campos: queixa_inicial, historico_saude, historico_familiar, medico_responsavel, medicamentos_em_uso, diagnosticos_previos, tratamentos_anteriores, expectativas_tratamento, rede_apoio, observacoes_gerais, encaminhamento. Não use nenhuma outra chave.",
    params: [
      { nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." },
      { nome: "p_campos", tipo: "json", desc: "Objeto JSON só com as chaves da anamnese que o profissional quer preencher/atualizar nesta mensagem." },
      { nome: "p_observacao", tipo: "string", desc: "Observação livre opcional sobre esta atualização de anamnese." },
    ],
  },
];

function construirNoTool(tool, posY) {
  const paramsExpr = tool.params
    .map((p) => `"${p.nome}": $fromAI('${p.nome}', ${JSON.stringify(p.desc)}, '${p.tipo}')`)
    .join(", ");
  const jsonBody =
    `={{ { "tool_name": "${tool.nome}", "whatsapp_number": $('Execute Workflow Trigger').item.json.whatsapp_number, "params": { ${paramsExpr} } } }}`;
  return {
    parameters: {
      toolDescription: tool.descricao,
      method: "POST",
      url: "=https://psiagente.com.br/api/agent/call-tool",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: {},
    },
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    typeVersion: 1.1,
    position: [posY % 5 * 220, 320 + Math.floor(posY / 5) * 160],
    id: `a9e17${String(posY).padStart(3, "0")}-0000-4000-8000-000000000000`,
    name: tool.nome,
    credentials: {
      httpHeaderAuth: { id: credProxyId, name: "Agent Tool Secret - proxy Next.js" },
    },
  };
}

const SYSTEM_PROMPT = `Você é o(a) secretário(a) virtual de um consultório de psicologia, atendendo o(a) profissional (psicólogo/a) pelo WhatsApp. Tom profissional e cordial, respostas curtas (é WhatsApp, não e-mail), sem markdown pesado (nada de #, **, tabelas).

Nunca exponha id interno de sessão/paciente/consultório na resposta — fale em nomes e datas, o profissional não sabe (nem precisa saber) o número de linha do banco.

Protocolo de consultório ambíguo: se qualquer tool falhar com o erro CONSULTORIO_AMBIGUO, chame agent_listar_consultorios, pergunte ao profissional qual consultório ele quer usar, chame agent_definir_consultorio_ativo com a escolha dele, e só então tente de novo a ação original.

Confirmação antes de ação destrutiva: antes de chamar agent_excluir_sessao, agent_excluir_pagamento ou agent_cancelar_sessao, repita o que você vai fazer e peça confirmação explícita (ex: "Confirma que quer excluir o atendimento do dia 10/03 com a Maria?") e só execute depois que o profissional confirmar claramente.

Tradução de erro: nunca mostre um código de erro cru. Traduza para frase humana, por exemplo: WHATSAPP_NAO_VINCULADO -> "seu WhatsApp ainda não está vinculado a uma conta"; SESSAO_NAO_ENCONTRADA -> "não encontrei esse atendimento"; SESSAO_NAO_REAGENDAVEL -> "esse atendimento já foi realizado ou cancelado, não dá pra reagendar"; SESSAO_TEM_VINCULO_FINANCEIRO -> "esse atendimento tem pagamento ou recibo vinculado, não dá pra excluir — mas posso cancelar, se preferir"; PAGAMENTO_TEM_NOTA_FISCAL -> "esse pagamento tem nota fiscal emitida, não dá pra excluir"; PACIENTE_INVALIDO -> "não encontrei esse paciente"; CAMPO_ANAMNESE_INVALIDO ou CAMPOS_INVALIDOS -> "não entendi esse campo da anamnese, pode reformular?"; CONTA_INVALIDA -> "não encontrei essa conta financeira"; PAGAMENTO_NAO_ENCONTRADO -> "não encontrei esse pagamento"; SEM_CONSULTORIO_CADASTRADO -> "você ainda não tem nenhum consultório cadastrado no sistema".

Quando agent_reagendar_sessao retornar alerta=true no resultado, avise o profissional de forma gentil que esse paciente já remarcou várias vezes este mês.`;

const workflow = {
  name: "WA - Agent Psicólogo",
  nodes: [
    {
      parameters: {
        workflowInputs: {
          values: [
            { name: "whatsapp_number" },
            { name: "mensagem_texto" },
            { name: "usuario_nome" },
          ],
        },
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      id: "a9e17000-0000-4000-8000-000000000001",
      name: "Execute Workflow Trigger",
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $json.mensagem_texto }}",
        options: { systemMessage: SYSTEM_PROMPT },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2.1,
      position: [240, 0],
      id: "a9e17000-0000-4000-8000-000000000002",
      name: "AI Agent",
    },
    {
      parameters: {
        modelId: { __rl: true, mode: "id", value: "models/gemini-3.5-flash-lite" },
        options: {},
      },
      type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      typeVersion: 1,
      position: [120, 200],
      id: "a9e17000-0000-4000-8000-000000000003",
      name: "Google Gemini Chat Model",
      credentials: {
        googlePalmApi: { id: credGeminiId, name: "Google Gemini - agente WhatsApp" },
      },
    },
    {
      parameters: {
        sessionIdType: "customKey",
        sessionKey: "={{ $('Execute Workflow Trigger').item.json.whatsapp_number }}",
        tableName: "n8n_chat_histories",
        contextWindowLength: 10,
      },
      type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
      typeVersion: 1.3,
      position: [280, 200],
      id: "a9e17000-0000-4000-8000-000000000004",
      name: "Postgres Chat Memory",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (direct DB)" },
      },
    },
    ...tools.map((t, i) => construirNoTool(t, i)),
  ],
  connections: {
    "Execute Workflow Trigger": {
      main: [[{ node: "AI Agent", type: "main", index: 0 }]],
    },
    "Google Gemini Chat Model": {
      ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
    },
    "Postgres Chat Memory": {
      ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]],
    },
    ...Object.fromEntries(
      tools.map((t) => [t.nome, { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]] }])
    ),
  },
  settings: { executionOrder: "v1" },
};

const criado = await n8nRequest("POST", "/workflows", workflow);
console.log(`Workflow "WA - Agent Psicólogo" criado, id=${criado.id}, nós=${workflow.nodes.length}`);

const idsPath2 = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
ids.workflows = ids.workflows || {};
ids.workflows.agentPsicologo = criado.id;
fs.writeFileSync(idsPath2, JSON.stringify(ids, null, 2));
```

- [ ] **Step 2: Rodar**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
node scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
```

Expected: `Workflow "WA - Agent Psicólogo" criado, id=..., nós=22` (1 trigger + 1 agent + 1 chat model + 1 memory + 18 tools).

Se o `POST` falhar (400, node type/parameter rejeitado): a resposta de erro do n8n normalmente aponta o nó e o campo problemático — ajustar o campo apontado neste script e repetir. Erros esperados nesta etapa (não são bloqueio): shape de `modelId` do Gemini Chat Model, shape de `sessionIdType`/`tableName` da Memory, versão do `@n8n/n8n-nodes-langchain.agent`. Tentar até 5 variações razoáveis antes de escalar para verificação visual no Step 4.

- [ ] **Step 3: Verificar via GET — contagem e tipos de nó**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/n8n-agente-whatsapp/ids.json','utf8')).workflows.agentPsicologo)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WF_ID" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const wf=JSON.parse(d);
  console.log('nodeCount:', wf.nodes.length);
  const porTipo={};
  for(const n of wf.nodes) porTipo[n.type]=(porTipo[n.type]||0)+1;
  console.log(porTipo);
  console.log('connections keys:', Object.keys(wf.connections).length);
});
"
```

Expected: `nodeCount: 22`, `{'n8n-nodes-base.executeWorkflowTrigger':1, '@n8n/n8n-nodes-langchain.agent':1, '@n8n/n8n-nodes-langchain.lmChatGoogleGemini':1, '@n8n/n8n-nodes-langchain.memoryPostgresChat':1, '@n8n/n8n-nodes-langchain.toolHttpRequest':18}`, `connections keys: 21` (trigger + chat model + memory + 18 tools, todos como origem de uma conexão).

- [ ] **Step 4: Verificação visual (nó AI Agent é o de maior risco de schema)**

Abrir `https://psifacil-n8n.lcuzxl.easypanel.host` no navegador (usar o chrome-devtools MCP já configurado neste projeto, login já salvo/sessão do usuário), abrir o workflow "WA - Agent Psicólogo", confirmar visualmente:
- O nó "AI Agent" aparece conectado a exatamente 1 Chat Model, 1 Memory e 18 Tools (ícones de entrada na base do nó), sem badge de erro vermelho.
- Abrir o nó "Google Gemini Chat Model" e confirmar que o campo de modelo mostra `gemini-3.5-flash-lite` (ou aceita o valor sem erro de validação).
- Rodar "Test step" no nó "AI Agent" isoladamente não é possível sem uma execução completa (depende do trigger) — em vez disso, deixar a verificação de execução real pra Task 6 (mensagem real de WhatsApp), que é quando existe um caso de teste ponta a ponta de verdade.

Se qualquer um desses pontos mostrar erro: voltar ao Step 1, ajustar o(s) campo(s) indicado(s) pela UI (que mostra a mensagem de validação real do n8n, mais completa que a API), recriar o workflow (deletar o antigo via `DELETE /api/v1/workflows/{id}` e rodar o script de novo, ou `PUT` pra atualizar) e repetir a partir do Step 3.

- [ ] **Step 5: Commit**

```bash
git add scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs scripts/n8n-agente-whatsapp/ids.json
git commit -m "feat: cria workflow n8n WA - Agent Psicologo com 18 tools"
```

---

### Task 4: Workflow "WA - Inbound Router"

**Files:**
- Create: `scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs`

**Interfaces:**
- Consumes: `ids.json.credenciais.postgres`, `ids.json.workflows.enviarMensagem`, `ids.json.workflows.agentPsicologo` (Tasks 1-3).
- Produces: `ids.json.workflows.inboundRouter` (id) — consumido pela Task 5 (URL de produção do webhook = `${N8N_BASE_URL}/webhook/wa-inbound`, só fica ativa depois que este workflow for ativado).
- Formato do payload da Evolution API (evento `MESSAGES_UPSERT`, a confirmar/ajustar no Step 3 com um payload real — ver nota abaixo): `body.event`, `body.data.key.remoteJid`, `body.data.key.fromMe`, `body.data.messageType`, `body.data.message.conversation`.

- [ ] **Step 1: Criar o script**

```js
// scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const credPostgresId = ids.credenciais.postgres;
const wfEnviarMensagem = ids.workflows.enviarMensagem;
const wfAgentPsicologo = ids.workflows.agentPsicologo;

function noEnviarMensagem(id, posicao, nomeMensagem, mensagemLiteral) {
  return {
    parameters: {
      workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
      workflowInputs: {
        value: {
          whatsapp_number: "={{ $json.numero_normalizado }}",
          mensagem: mensagemLiteral,
        },
      },
    },
    type: "n8n-nodes-base.executeWorkflow",
    typeVersion: 1.2,
    position: posicao,
    id,
    name: nomeMensagem,
  };
}

const workflow = {
  name: "WA - Inbound Router",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "wa-inbound",
        responseMode: "onReceived",
        options: {},
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      id: "b7c17000-0000-4000-8000-000000000001",
      name: "Webhook Evolution",
      webhookId: "wa-inbound-router",
    },
    {
      parameters: {
        jsCode: `const body = $input.item.json.body || {};
const data = body.data || {};
const remoteJid = (data.key && data.key.remoteJid) || "";
const numero_normalizado = remoteJid.split("@")[0].replace(/\\D/g, "");
const fromMe = !!(data.key && data.key.fromMe);
const isMessageEvent = body.event === "messages.upsert";
const messageType = data.messageType || "";
const isText = messageType === "conversation" || messageType === "extendedTextMessage";
const texto = (data.message && (data.message.conversation || (data.message.extendedTextMessage && data.message.extendedTextMessage.text))) || "";
return [{ json: { numero_normalizado, fromMe, isMessageEvent, isText, texto } }];`,
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      id: "b7c17000-0000-4000-8000-000000000002",
      name: "Normalizar Payload",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.isMessageEvent }}", rightValue: true, operator: { type: "boolean", operation: "true" } },
            { leftValue: "={{ $json.fromMe }}", rightValue: false, operator: { type: "boolean", operation: "false" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [440, 0],
      id: "b7c17000-0000-4000-8000-000000000003",
      name: "É mensagem nova de terceiro?",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.isText }}", rightValue: true, operator: { type: "boolean", operation: "true" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [660, -80],
      id: "b7c17000-0000-4000-8000-000000000004",
      name: "É mensagem de texto?",
    },
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-000000000005",
      [880, -160],
      "Enviar: só texto",
      "Por enquanto só consigo entender mensagens de texto 🙂"
    ),
    {
      parameters: {
        operation: "executeQuery",
        query:
          "select id, nome from \"Usuarios\" where whatsapp_number = $1 and whatsapp_verified = true limit 1",
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
        postgres: { id: credPostgresId, name: "Supabase - psiagente (direct DB)" },
      },
      onError: "continueRegularOutput",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $json.id }}", rightValue: "", operator: { type: "string", operation: "notEmpty" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1100, 0],
      id: "b7c17000-0000-4000-8000-000000000007",
      name: "Usuário encontrado?",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfAgentPsicologo },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
            mensagem_texto: "={{ $('Normalizar Payload').item.json.texto }}",
            usuario_nome: "={{ $json.nome }}",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1320, -80],
      id: "b7c17000-0000-4000-8000-000000000008",
      name: "Chamar Agent Psicólogo",
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
      position: [1540, -80],
      id: "b7c17000-0000-4000-8000-000000000009",
      name: "Enviar: resposta do Agent",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $('Normalizar Payload').item.json.texto }}", rightValue: "^\\\\d{6}$", operator: { type: "string", operation: "regex" } },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1320, 80],
      id: "b7c17000-0000-4000-8000-00000000000a",
      name: "Parece código de 6 dígitos?",
    },
    {
      parameters: {
        operation: "executeQuery",
        query: "select validar_codigo_whatsapp($1, $2) as resultado",
        options: {
          queryReplacement:
            "={{ [$('Normalizar Payload').item.json.numero_normalizado, $('Normalizar Payload').item.json.texto] }}",
        },
      },
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1540, 40],
      id: "b7c17000-0000-4000-8000-00000000000b",
      name: "Validar Código Vinculação",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (direct DB)" },
      },
      onError: "continueErrorOutput",
    },
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-00000000000c",
      [1760, 0],
      "Enviar: boas-vindas vinculado",
      "=Seu WhatsApp foi vinculado com sucesso! A partir de agora você pode consultar sua agenda, pagamentos e pacientes por aqui. Experimente perguntar: \"quais atendimentos eu tenho hoje?\""
    ),
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-00000000000d",
      [1760, 120],
      "Enviar: código inválido",
      "Esse código não é válido ou já expirou. Gere um novo em /configuracoes/whatsapp e envie de novo por aqui."
    ),
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-00000000000e",
      [1540, 160],
      "Enviar: instruções de vinculação",
      "Não encontrei seu número vinculado a nenhuma conta. Acesse /configuracoes/whatsapp no aplicativo, gere um código de 6 dígitos e envie ele aqui pra mim."
    ),
  ],
  connections: {
    "Webhook Evolution": { main: [[{ node: "Normalizar Payload", type: "main", index: 0 }]] },
    "Normalizar Payload": { main: [[{ node: "É mensagem nova de terceiro?", type: "main", index: 0 }]] },
    "É mensagem nova de terceiro?": {
      main: [[{ node: "É mensagem de texto?", type: "main", index: 0 }], []],
    },
    "É mensagem de texto?": {
      main: [
        [{ node: "Buscar Usuario Vinculado", type: "main", index: 0 }],
        [{ node: "Enviar: só texto", type: "main", index: 0 }],
      ],
    },
    "Buscar Usuario Vinculado": { main: [[{ node: "Usuário encontrado?", type: "main", index: 0 }]] },
    "Usuário encontrado?": {
      main: [
        [{ node: "Chamar Agent Psicólogo", type: "main", index: 0 }],
        [{ node: "Parece código de 6 dígitos?", type: "main", index: 0 }],
      ],
    },
    "Chamar Agent Psicólogo": { main: [[{ node: "Enviar: resposta do Agent", type: "main", index: 0 }]] },
    "Parece código de 6 dígitos?": {
      main: [
        [{ node: "Validar Código Vinculação", type: "main", index: 0 }],
        [{ node: "Enviar: instruções de vinculação", type: "main", index: 0 }],
      ],
    },
    "Validar Código Vinculação": {
      main: [
        [{ node: "Enviar: boas-vindas vinculado", type: "main", index: 0 }],
        [{ node: "Enviar: código inválido", type: "main", index: 0 }],
      ],
    },
  },
  settings: { executionOrder: "v1" },
};

const criado = await n8nRequest("POST", "/workflows", workflow);
console.log(`Workflow "WA - Inbound Router" criado, id=${criado.id}, nós=${workflow.nodes.length}`);

ids.workflows.inboundRouter = criado.id;
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
```

- [ ] **Step 2: Rodar**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
node scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs
```

Expected: `Workflow "WA - Inbound Router" criado, id=..., nós=14`.

- [ ] **Step 3: Verificar via GET + confirmar payload real da Evolution API**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/n8n-agente-whatsapp/ids.json','utf8')).workflows.inboundRouter)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$WF_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const wf=JSON.parse(d);console.log('nodeCount:', wf.nodes.length);});"
```

Expected: `nodeCount: 14`.

O código em "Normalizar Payload" assume o shape de payload do Evolution API v2 documentado (`event`, `data.key.remoteJid/fromMe`, `data.messageType`, `data.message.conversation`). Esse shape só é confirmável de verdade com uma mensagem real chegando (Evolution está desconectada agora — ver Global Constraints). Deixar essa confirmação para a Task 6: se o primeiro teste real mostrar campos diferentes dos esperados, ajustar apenas o `jsCode` deste nó (via `PATCH /api/v1/workflows/{id}` ou recriando) e reexecutar o teste — não precisa recriar os outros nós.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs scripts/n8n-agente-whatsapp/ids.json
git commit -m "feat: cria workflow n8n WA - Inbound Router"
```

---

### Task 5: Ativar os 3 workflows + configurar webhook da Evolution API

**Files:**
- Create: `scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs`

**Interfaces:**
- Consumes: `ids.json.workflows.{enviarMensagem,agentPsicologo,inboundRouter}` (Tasks 2-4).
- Produces: efeito colateral em produção — 3 workflows `active: true`, webhook da instância Evolution `psifacil` apontando pra `${N8N_BASE_URL}/webhook/wa-inbound`.

- [ ] **Step 1: Criar o script**

```js
// scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest, evolutionRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { enviarMensagem, agentPsicologo, inboundRouter } = ids.workflows;

// Ordem importa: sub-workflows primeiro, Router por último (webhook de produção só existe
// depois que o próprio Router está ativo).
for (const [nome, id] of [
  ["WA - Enviar Mensagem", enviarMensagem],
  ["WA - Agent Psicólogo", agentPsicologo],
  ["WA - Inbound Router", inboundRouter],
]) {
  await n8nRequest("POST", `/workflows/${id}/activate`, {});
  console.log(`Workflow "${nome}" (${id}) ativado.`);
}

const webhookUrl = `${process.env.N8N_BASE_URL}/webhook/wa-inbound`;
await evolutionRequest("POST", "/webhook/set/psifacil", {
  webhook: {
    url: webhookUrl,
    enabled: true,
    webhookByEvents: true,
    events: ["MESSAGES_UPSERT"],
  },
});
console.log(`Webhook da Evolution API (instância psifacil) configurado para: ${webhookUrl}`);
```

- [ ] **Step 2: Rodar**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
export EVOLUTION_API_KEY=$(ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130 "docker service inspect psifacil_evolution-api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'" | grep '^AUTHENTICATION_API_KEY=' | cut -d= -f2-)
export EVOLUTION_BASE_URL="https://psifacil-evolution-api.lcuzxl.easypanel.host"
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia"
node scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs
```

Expected: 3 linhas "Workflow ... ativado." + 1 linha "Webhook da Evolution API ... configurado".

Se `POST /webhook/set/psifacil` retornar 400 pelo shape do body: a forma alternativa mais comum na Evolution API v2 é o corpo sem o wrapper `webhook` (campos direto na raiz) — se a primeira tentativa falhar, tentar `{url, enabled, webhookByEvents, events}` sem o wrapper, e ajustar o script.

- [ ] **Step 3: Verificar — 3 workflows ativos + webhook configurado**

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows?limit=50" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);for(const w of (j.data||j)) if(/^WA -/.test(w.name)) console.log(w.name, 'active:', w.active);});"

export EVOLUTION_API_KEY=$(ssh -i ~/.ssh/psifacil_vps -o BatchMode=yes root@179.198.103.130 "docker service inspect psifacil_evolution-api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'" | grep '^AUTHENTICATION_API_KEY=' | cut -d= -f2-)
curl -s -H "apikey: $EVOLUTION_API_KEY" "https://psifacil-evolution-api.lcuzxl.easypanel.host/webhook/find/psifacil"
```

Expected: as 3 linhas `WA - ... active: true`, e o `GET /webhook/find/psifacil` retorna a URL configurada no Step 2 com `enabled: true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs scripts/n8n-agente-whatsapp/ids.json
git commit -m "feat: ativa workflows do agente de WhatsApp e configura webhook da Evolution API"
```

---

### Task 6: Verificação ponta a ponta + atualização da documentação

**Files:**
- Modify: `docs/backlog-novas-funcionalidades.md`
- Modify: `docs/status-implementacao.md`

**Interfaces:**
- Consumes: os 3 workflows ativos e o webhook configurado (Task 5).
- Não produz interface nova — é a task de fechamento.

- [ ] **Step 1: Verificação sintética do Router (sem depender do WhatsApp real)**

Simular um payload de vinculação por código, direto no webhook de produção do Router, pra confirmar que o pipeline Webhook → Normalizar → Postgres → Enviar Mensagem roda sem erro interno no n8n (mesmo que o número de teste não exista de verdade em `whatsapp_verificacao_codigos` — o objetivo aqui é confirmar ausência de erro de execução, não o resultado de negócio):

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
curl -s -X POST "$N8N_BASE_URL/webhook/wa-inbound" -H "Content-Type: application/json" -d '{
  "event": "messages.upsert",
  "instance": "psifacil",
  "data": {
    "key": { "remoteJid": "5511900000000@s.whatsapp.net", "fromMe": false, "id": "TESTE123" },
    "messageType": "conversation",
    "message": { "conversation": "123456" }
  }
}'
```

```bash
source "C:\Users\ADMINI~1\AppData\Local\Temp\claude\c--Users-Administrador-Desktop-Projetos-Psicologia\8dae03c6-9e29-47f1-a2de-7fb386d3abad\scratchpad\n8n-session.env"
WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/n8n-agente-whatsapp/ids.json','utf8')).workflows.inboundRouter)")
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/executions?workflowId=$WF_ID&limit=1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const e=(j.data||j)[0];console.log('status:', e && e.status, 'finished:', e && e.finished);});"
```

Expected: `status: success, finished: true`. Se o payload sintético não bater com o shape real do Evolution (`data.messageType`/`data.message.conversation`), o "Normalizar Payload" (Task 4) pode não extrair o texto corretamente — isso só é confirmável de verdade com uma mensagem real (Step 3 abaixo), que é quando o campo `numero_normalizado`/`texto` deve ser reconferido nos logs de execução do n8n.

- [ ] **Step 2: Conferir `agent_audit_log` antes do teste real (baseline)**

```bash
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query('select count(*) from agent_audit_log');
  console.log('linhas em agent_audit_log antes do teste real:', r.rows[0].count);
  await client.end();
});
"
```

Expected: registra o número atual pra comparar depois do teste real no Step 4.

- [ ] **Step 3: Preciso de você — reconectar o WhatsApp**

Este passo depende de ação humana que nenhum script consegue fazer: a instância `psifacil` da Evolution API está com `connectionStatus: close` (desconectada). É necessário escanear um QR code com o celular vinculado. Isso é comunicado ao usuário no final desta task, não executado automaticamente.

- [ ] **Step 4: Roteiro de teste real (executado pelo usuário, após reconectar)**

Mandar, do WhatsApp vinculado, estas mensagens em sequência, conferindo a resposta recebida:
1. "quais atendimentos eu tenho hoje?" — consulta de leitura (`agent_get_agenda`).
2. Pedir pra cancelar um atendimento de teste — deve vir confirmação antes de executar (`agent_cancelar_sessao`).
3. Se o profissional de teste tiver 2+ consultórios: qualquer pergunta deve disparar o protocolo `CONSULTORIO_AMBIGUO` uma vez, depois não perguntar mais na mesma conversa.
4. Mandar um áudio — deve receber a resposta fixa de "só texto".
5. (Se aplicável) Vincular um número novo pelo fluxo de código de 6 dígitos.

Depois, reconferir `agent_audit_log`:

```bash
DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query('select tool_name, sucesso, criado_em from agent_audit_log order by criado_em desc limit 10');
  console.table(r.rows);
  await client.end();
});
"
```

Expected: uma linha nova por tool chamada durante o teste, `sucesso: true` nas que deveriam ter sucesso.

- [ ] **Step 5: Atualizar `docs/backlog-novas-funcionalidades.md`**

Marcar o item 13 como concluído (metades 1, 2a e 2b), com uma linha resumindo que os 3 workflows estão ativos em produção.

- [ ] **Step 6: Atualizar `docs/status-implementacao.md`**

Adicionar seção documentando: os 3 workflows n8n (nomes + propósito), as 4 credenciais criadas, a configuração do webhook da Evolution API, e uma nota sobre o risco de desconexão da instância (já documentado na spec, reforçar aqui o link entre "Evolution desconectada" = "agente de WhatsApp inteiro fora do ar pra todo profissional").

- [ ] **Step 7: Commit**

```bash
git add docs/backlog-novas-funcionalidades.md docs/status-implementacao.md
git commit -m "docs: marca item 13 (agente de WhatsApp) como concluido e documenta workflows n8n"
```

---

## Self-Review

**Cobertura da spec:** Enviar Mensagem (Task 2), Inbound Router com filtro de não-texto/fromMe, normalização de número, vinculação por código e roteamento (Task 4), Agent Psicólogo com Gemini 3.5 Flash-Lite + memória + 18 tools + system prompt com todos os pontos obrigatórios (Task 3), webhook da Evolution API configurado (Task 5), verificação em camadas incluindo teste real de WhatsApp (Task 6) — todas as seções da spec `2026-08-19-agente-whatsapp-workflow-n8n-design.md` têm task correspondente.

**Placeholders:** nenhum "TBD"/"implementar depois" — os 18 nós de tool são gerados por um loop cuja tabela de entrada já tem todos os dados reais (nome do parâmetro, tipo, descrição), não é um placeholder, é geração de código repetitivo.

**Consistência de tipos:** contrato `{whatsapp_number, mensagem}` do "WA - Enviar Mensagem" (Task 2) é o mesmo usado pelas chamadas Execute Workflow nas Tasks 3 e 4. Contrato `{whatsapp_number, mensagem_texto, usuario_nome}` → `{output}` do "WA - Agent Psicólogo" (Task 3) é o mesmo lido pela Task 4 (`$json.output`). `ids.json` como fonte única de ids de credencial/workflow evita hardcode divergente entre tasks.
