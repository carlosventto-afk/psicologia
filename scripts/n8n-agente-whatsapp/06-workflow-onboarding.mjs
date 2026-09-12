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

// Item 24 parte 4 do backlog: este prompt deixa de ser só "assistente
// de cadastro" e passa a atender também quem só quer tirar dúvida
// antes de decidir (agente comercial). Preços abaixo vêm de
// web/lib/planos.js -- se o preço mudar lá, atualizar aqui também
// (decisão aceita por ora: string estática, sem tool de consulta).
// Mesmo padrao de construirNoToolCriarConta -- "acao": "escalar" em vez
// de "criar_conta", um so parametro (motivo).
function construirNoToolEscalar() {
  const jsonBody =
    `={{ '{"acao": "escalar", "whatsapp_number": ' + JSON.stringify($('Execute Workflow Trigger').first().json.whatsapp_number) + ', "motivo": {motivo} }' }}`;
  return {
    parameters: {
      toolDescription: "Avisa um humano pra continuar a conversa. So chame quando a pessoa pedir pra falar com alguem, perguntar algo que voce nao tem certeza de responder, ou parecer insatisfeita.",
      method: "POST",
      url: "=https://psiagente.com.br/api/agent/onboarding",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      placeholderDefinitions: {
        values: [{ name: "motivo", description: "Resumo curto do que a pessoa quer ou perguntou.", type: "string" }],
      },
      options: {},
    },
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    typeVersion: 1.1,
    position: [240, 440],
    id: "c8d17000-0000-4000-8000-000000000011",
    name: "agent_escalar_para_humano",
    credentials: {
      httpHeaderAuth: { id: credProxyId, name: "Agent Tool Secret - proxy Next.js" },
    },
  };
}

const SYSTEM_PROMPT_CADASTRO = `Você é o(a) assistente comercial do PsiAgente (sistema de gestão pra psicólogos), no WhatsApp. Alguém te mandou uma mensagem de um número que ainda não está vinculado a nenhuma conta. Tom acolhedor, respostas curtas (é WhatsApp), sem markdown pesado.

Primeiro descubra: essa pessoa já usa o sistema (tem conta feita pelo aplicativo ou por outro número de WhatsApp) ou é a primeira vez? Pergunte isso de forma natural, sem menu numerado.

Se a pessoa já tem conta: oriente a gerar um código de 6 dígitos em /configuracoes/whatsapp no aplicativo e mandar esse código aqui pra esta mesma conversa — não chame nenhuma ferramenta, só oriente.

Se é a primeira vez: não presuma que ela já quer criar conta agora. Pode ter só dúvida sobre o produto — responda à vontade antes de empurrar pro cadastro. Planos reais (não invente valor nem recurso):
- Grátis: R$ 0/mês. Gestão básica de agenda e pacientes, 1 consultório.
- Psi Gestão: R$ 49,90/mês. Agenda, financeiro, documentos, lembrete automático por WhatsApp, Carnê-Leão automático, consultórios ilimitados. Sem perfil no diretório público.
- Psi Marketing: R$ 39,90/mês. Perfil no diretório público de psicólogos, consultórios ilimitados. Sem os recursos de gestão do Psi Gestão.
- Psi Gestão + Marketing: R$ 79,90/mês. Tudo do Psi Gestão + perfil no diretório público.

Quando a pessoa topar criar conta: colete o nome completo e o e-mail (uma pergunta de cada vez, sem pedir os dois juntos) e então chame agent_criar_conta. Depois de chamar, avise que um link de confirmação foi mandado por e-mail e que ela precisa clicar nesse link pra continuar.

Chame agent_escalar_para_humano (parâmetro: motivo, um resumo curto do que a pessoa quer) quando: ela pedir explicitamente pra falar com uma pessoa; perguntar algo que você não tem certeza de responder (negociação de preço/desconto, reclamação, caso muito específico do consultório dela); ou parecer insatisfeita com sua resposta. Depois de chamar, avise que alguém vai continuar a conversa em breve — não invente uma resposta que você não tem certeza.

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
        sessionKey: "={{ 'onboarding:' + $('Execute Workflow Trigger').first().json.whatsapp_number }}",
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
    construirNoToolEscalar(),
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
          "update \"Usuarios\" u\nset whatsapp_verified = true,\n    whatsapp_number = $1\nfrom agent_sessions s\nwhere s.whatsapp_number = $1 and u.id = s.usuario_id;\n\nupdate agent_sessions\nset ultima_validacao_seguranca_em = now(),\n    link_confirmacao_pendente = false,\n    onboarding_etapa = case when onboarding_etapa = 'aguardando_confirmacao_email' then 'consultorio' else onboarding_etapa end\nwhere whatsapp_number = $1\nreturning onboarding_etapa;",
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
    agent_escalar_para_humano: { ai_tool: [[{ node: "AI Agent Cadastro", type: "ai_tool", index: 0 }]] },
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
