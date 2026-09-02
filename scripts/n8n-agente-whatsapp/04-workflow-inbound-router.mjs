// scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const credPostgresId = ids.credenciais.postgres;
const credWebhookSecretId = ids.credenciais.webhookSecret;
const wfEnviarMensagem = ids.workflows.enviarMensagem;
const wfAgentPsicologo = ids.workflows.agentPsicologo;

// Debounce de mensagens fragmentadas: quando o profissional manda a
// pergunta em várias mensagens curtas seguidas, cada uma chegava como um
// webhook separado e cada uma disparava uma chamada de Agent (Gemini)
// isolada — desperdiçando tokens e respondendo pedaço por pedaço em vez de
// uma vez só. Ver "Bufferizar Mensagem"/"Esperar Mensagens
// Fragmentadas"/"Consumir Buffer (só se for a última)" abaixo.
const DEBOUNCE_WAIT_SECONDS = 8;

// Critical #1 (revisão final): antes disto era "={{ $json.numero_normalizado }}",
// que só resolve corretamente quando $json ainda é a saída de "Normalizar
// Payload" (o único call site nesse contexto é "Enviar: só texto"). Os
// outros 3 call sites ficam depois de nós Postgres, onde $json é a saída
// DAQUELE nó (sem "numero_normalizado"), então o sub-workflow "WA - Enviar
// Mensagem" era chamado sem whatsapp_number — a Evolution API rejeitava com
// "Bad request". Referenciar o nó pelo nome (como o resto do workflow já faz
// em "Chamar Agent Psicólogo"/"Enviar: resposta do Agent") resolve certo
// não importa de onde o helper for chamado.
function noEnviarMensagem(id, posicao, nomeMensagem, mensagemLiteral) {
  return {
    parameters: {
      workflowId: { __rl: true, mode: "id", value: wfEnviarMensagem },
      workflowInputs: {
        value: {
          whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
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
      // Critical #5 (revisão final): o webhook não tinha nenhuma
      // autenticação — qualquer um que descobrisse a URL podia forjar um
      // payload messages.upsert se passando por qualquer número (inclusive
      // um já vinculado a um profissional real) e disparar qualquer tool,
      // incluindo as destrutivas (agent_excluir_sessao/
      // agent_cancelar_sessao/agent_excluir_pagamento). Confirmado ao vivo:
      // um curl não autenticado de fora conseguiu rodar o pipeline inteiro.
      // Fix: headerAuth com segredo compartilhado (credencial
      // "webhookSecret"), verificado pelo próprio n8n antes de qualquer nó
      // do workflow rodar. Path também trocado de "wa-inbound" (adivinhável)
      // pra um segmento aleatório — reforço, não substitui a autenticação.
      parameters: {
        httpMethod: "POST",
        path: "wa-inbound-e96da1092a23a820",
        responseMode: "onReceived",
        authentication: "headerAuth",
        options: {},
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      id: "b7c17000-0000-4000-8000-000000000001",
      name: "Webhook Evolution",
      webhookId: "wa-inbound-router",
      credentials: {
        httpHeaderAuth: { id: credWebhookSecretId, name: "Webhook Evolution -> n8n (shared secret)" },
      },
    },
    {
      parameters: {
        jsCode: `const body = $input.item.json.body || {};
const data = body.data || {};
const remoteJid = (data.key && data.key.remoteJid) || "";
// Grupo do WhatsApp: remoteJid termina em "@g.us" e a parte antes do "@" é o
// id do grupo (às vezes no formato legado "<numero-de-quem-criou>-<timestamp>"),
// nunca um número de telefone real. Sem este filtro, o replace(/\\D/g, "")
// abaixo produzia um "numero_normalizado" de lixo (ex.: concatenando o
// número do criador com o timestamp do grupo) que a Evolution API rejeitava
// com 400 Bad Request ao tentar responder — confirmado em produção: todas as
// mensagens de um grupo específico erraram dessa forma, uma atrás da outra.
const isGroup = remoteJid.endsWith("@g.us");
const numero_normalizado = remoteJid.split("@")[0].replace(/\\D/g, "");
const fromMe = !!(data.key && data.key.fromMe);
const isMessageEvent = body.event === "messages.upsert";
const messageType = data.messageType || "";
const isText = messageType === "conversation" || messageType === "extendedTextMessage";
const texto = (data.message && (data.message.conversation || (data.message.extendedTextMessage && data.message.extendedTextMessage.text))) || "";
return [{ json: { numero_normalizado, fromMe, isMessageEvent, isText, texto, isGroup } }];`,
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
            { leftValue: "={{ $json.isGroup }}", rightValue: false, operator: { type: "boolean", operation: "false" } },
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
          "select\n  coalesce((select id::text from \"Usuarios\" where whatsapp_number = $1 and whatsapp_verified = true limit 1), '') as id,\n  (select nome from \"Usuarios\" where whatsapp_number = $1 and whatsapp_verified = true limit 1) as nome",
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
      // Important #1 (revisão final): era "continueRegularOutput", que faz
      // um erro de banco virar um item de saída indistinguível de "usuário
      // não encontrado" — um profissional já vinculado que sofresse um erro
      // de DB caía no fluxo de vinculação por código e ouvia "código
      // inválido" sobre um código que nem existe. "continueErrorOutput" com
      // uma branch de erro dedicada (abaixo) resolve isso.
      onError: "continueErrorOutput",
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
      // Cria/atualiza a linha do buffer para este número: acrescenta o
      // texto desta mensagem ao array "mensagens" e incrementa "versao".
      // "versao" é o valor que esta execução específica acabou de criar —
      // guardado para comparar depois do wait (ver nó de consumo abaixo).
      parameters: {
        operation: "executeQuery",
        query:
          "insert into agent_buffer_mensagens (whatsapp_number, mensagens, versao, atualizado_em)\nvalues ($1, array[$2], 1, now())\non conflict (whatsapp_number) do update set\n  mensagens = agent_buffer_mensagens.mensagens || excluded.mensagens,\n  versao = agent_buffer_mensagens.versao + 1,\n  atualizado_em = now()\nreturning versao;",
        options: {
          queryReplacement:
            "={{ [$('Normalizar Payload').item.json.numero_normalizado, $('Normalizar Payload').item.json.texto] }}",
        },
      },
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1320, -80],
      id: "b7c17000-0000-4000-8000-000000000010",
      name: "Bufferizar Mensagem",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
      // Mesmo padrão do Important #1: sem isto, um erro de DB aqui (ex.:
      // conexão caiu) derrubava a execução sem nenhuma resposta pro
      // profissional, indistinguível do bot estar fora do ar.
      onError: "continueErrorOutput",
    },
    {
      // Espera alguns segundos por possíveis mensagens seguintes do mesmo
      // profissional antes de acionar o Agent. "responseMode: onReceived"
      // no Webhook já respondeu 200 pra Evolution API muito antes disto —
      // este wait só atrasa a resposta no WhatsApp, não o webhook em si.
      parameters: {
        amount: DEBOUNCE_WAIT_SECONDS,
      },
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [1540, -80],
      id: "b7c17000-0000-4000-8000-000000000011",
      name: "Esperar Mensagens Fragmentadas",
      webhookId: "wa-inbound-router-debounce-wait",
    },
    {
      // Só apaga (consome) o buffer — e só então segue pro Agent — se
      // "versao" ainda for a mesma que esta execução criou/incrementou
      // antes do wait. Se uma mensagem mais nova chegou nesse meio-tempo,
      // ela já incrementou "versao" de novo: o WHERE não bate, o DELETE não
      // apaga nada, 0 linhas voltam e esta execução termina aqui, em
      // silêncio — quem manda a resposta final é a execução da ÚLTIMA
      // mensagem do lote, com o texto de todas juntas. Isso evita lock
      // explícito: a comparação de versão antes/depois do wait já garante
      // que só uma execução (a mais recente) prossiga.
      parameters: {
        operation: "executeQuery",
        query:
          "delete from agent_buffer_mensagens\nwhere whatsapp_number = $1 and versao = $2\nreturning mensagens;",
        options: {
          queryReplacement:
            "={{ [$('Normalizar Payload').item.json.numero_normalizado, $('Bufferizar Mensagem').item.json.versao] }}",
        },
      },
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1760, -80],
      id: "b7c17000-0000-4000-8000-000000000012",
      name: "Consumir Buffer (só se for a última)",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
      onError: "continueErrorOutput",
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: "id", value: wfAgentPsicologo },
        workflowInputs: {
          value: {
            whatsapp_number: "={{ $('Normalizar Payload').item.json.numero_normalizado }}",
            mensagem_texto: "={{ $json.mensagens.join('\\n') }}",
            usuario_nome: "={{ $('Buscar Usuario Vinculado').item.json.nome }}",
          },
        },
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1980, -80],
      id: "b7c17000-0000-4000-8000-000000000008",
      name: "Chamar Agent Psicólogo",
      // Important #4 (revisão final): sem isto, qualquer erro do Gemini
      // (quota, timeout, falha de tool call não tratada) derrubava a
      // execução inteira sem nenhuma resposta pro profissional —
      // indistinguível de o bot estar completamente fora do ar.
      // "continueErrorOutput" com uma branch de erro dedicada (abaixo) manda
      // uma mensagem de desculpa em vez de deixar o profissional no vácuo.
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
      position: [1540, -80],
      id: "b7c17000-0000-4000-8000-000000000009",
      name: "Enviar: resposta do Agent",
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            { leftValue: "={{ $('Normalizar Payload').item.json.texto }}", rightValue: "^\\d{6}$", operator: { type: "string", operation: "regex" } },
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
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
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
    // Important #1 + #4 (revisão final): branch de erro genérica,
    // compartilhada pelas duas fontes de erro do workflow ("Buscar Usuario
    // Vinculado" e "Chamar Agent Psicólogo") — um só nó de resposta em vez
    // de duplicar o mesmo texto duas vezes.
    noEnviarMensagem(
      "b7c17000-0000-4000-8000-00000000000f",
      [1100, 250],
      "Enviar: erro genérico",
      "Desculpa, tive um problema aqui do meu lado. Pode tentar de novo daqui a pouco?"
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
    "Buscar Usuario Vinculado": {
      main: [
        [{ node: "Usuário encontrado?", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
    "Usuário encontrado?": {
      main: [
        [{ node: "Bufferizar Mensagem", type: "main", index: 0 }],
        [{ node: "Parece código de 6 dígitos?", type: "main", index: 0 }],
      ],
    },
    "Bufferizar Mensagem": {
      main: [
        [{ node: "Esperar Mensagens Fragmentadas", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
    "Esperar Mensagens Fragmentadas": {
      main: [[{ node: "Consumir Buffer (só se for a última)", type: "main", index: 0 }]],
    },
    "Consumir Buffer (só se for a última)": {
      main: [
        [{ node: "Chamar Agent Psicólogo", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
    "Chamar Agent Psicólogo": {
      main: [
        [{ node: "Enviar: resposta do Agent", type: "main", index: 0 }],
        [{ node: "Enviar: erro genérico", type: "main", index: 0 }],
      ],
    },
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

// Idempotente: se o workflow já existe (ids.json.workflows.inboundRouter), atualiza via PUT
// em vez de criar um duplicado via POST. Isso permite reexecutar este script após corrigir
// bugs no código acima (ex.: a correção dos Critical #1/#2 pós-review) sem duplicar o workflow.
if (ids.workflows.inboundRouter) {
  const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows.inboundRouter}`, workflow);
  console.log(`Workflow "WA - Inbound Router" atualizado, id=${atualizado.id}, nós=${workflow.nodes.length}`);
} else {
  const criado = await n8nRequest("POST", "/workflows", workflow);
  console.log(`Workflow "WA - Inbound Router" criado, id=${criado.id}, nós=${workflow.nodes.length}`);
  ids.workflows.inboundRouter = criado.id;
  fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
}
