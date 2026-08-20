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
