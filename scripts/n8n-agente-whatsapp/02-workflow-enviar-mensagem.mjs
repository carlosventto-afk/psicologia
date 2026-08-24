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

// Idempotente: mesmo padrão de 03/04 (Important #5, revisão final) — se o
// workflow já existe, atualiza via PUT em vez de duplicar via POST.
ids.workflows = ids.workflows || {};
if (ids.workflows.enviarMensagem) {
  const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows.enviarMensagem}`, workflow);
  console.log(`Workflow "WA - Enviar Mensagem" atualizado, id=${atualizado.id}`);
} else {
  const criado = await n8nRequest("POST", "/workflows", workflow);
  console.log(`Workflow "WA - Enviar Mensagem" criado, id=${criado.id}`);
  ids.workflows.enviarMensagem = criado.id;
  fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
}
