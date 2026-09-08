// scripts/n8n-agente-whatsapp/05-configurar-webhook-e-ativar.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest, evolutionRequest } from "./lib.mjs";

// Checagem movida pra ANTES do loop de ativação (achado da re-revisão): se
// isto rodasse depois, uma execução sem a env var definida ativava os 3
// workflows e só então abortava antes de configurar o webhook da Evolution
// API — um estado parcial confuso. Mesmo padrão que 01-criar-credenciais.mjs
// já usa corretamente (valida tudo primeiro, só then age).
if (!process.env.WEBHOOK_SHARED_SECRET) {
  console.error("Defina WEBHOOK_SHARED_SECRET no ambiente antes de rodar este script (mesmo valor usado em 01-criar-credenciais.mjs para a credencial webhookSecret — os dois scripts precisam rodar com o MESMO valor; ver nota de acoplamento em 01-criar-credenciais.mjs).");
  process.exit(1);
}

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { enviarMensagem, agentPsicologo, inboundRouter, onboarding } = ids.workflows;

// Ordem importa: sub-workflows primeiro, Router por último (webhook de produção só existe
// depois que o próprio Router está ativo). 4 workflows no total (Enviar Mensagem, Agent
// Psicólogo, Onboarding, Router) — Onboarding entrou na lista depois que o Fase 2 do
// onboarding via WhatsApp foi implementado.
for (const [nome, id] of [
  ["WA - Enviar Mensagem", enviarMensagem],
  ["WA - Agent Psicólogo", agentPsicologo],
  ["WA - Onboarding", onboarding],
  ["WA - Inbound Router", inboundRouter],
]) {
  await n8nRequest("POST", `/workflows/${id}/activate`, {});
  console.log(`Workflow "${nome}" (${id}) ativado.`);
}

// Critical #5 (revisão final): path aleatório (não mais "wa-inbound",
// adivinhável) + header "x-webhook-secret" na config da Evolution API,
// espelhando a credencial "webhookSecret" que o nó Webhook do Router agora
// exige (authentication: "headerAuth"). Sem os dois lados em sincronia, a
// Evolution API para de conseguir entregar mensagens (401/403 do n8n).
const webhookUrl = `${process.env.N8N_BASE_URL}/webhook/wa-inbound-e96da1092a23a820`;
await evolutionRequest("POST", "/webhook/set/psifacil", {
  webhook: {
    url: webhookUrl,
    enabled: true,
    // O DTO da Evolution API (EventDto.webhook) usa o campo "byEvents", não
    // "webhookByEvents" — o nome antigo era silenciosamente ignorado (por
    // isso o valor efetivo em produção já era "false" mesmo com
    // "webhookByEvents: true" no código antigo, achado incidental desta
    // revisão). Explicitado aqui com o nome certo do campo, mesmo
    // comportamento desejado (um evento só, sem sufixo por tipo na URL).
    byEvents: false,
    events: ["MESSAGES_UPSERT"],
    headers: {
      "x-webhook-secret": process.env.WEBHOOK_SHARED_SECRET,
    },
  },
});
console.log(`Webhook da Evolution API (instância psifacil) configurado para: ${webhookUrl}`);
