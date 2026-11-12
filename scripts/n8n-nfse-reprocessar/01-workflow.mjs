// scripts/n8n-nfse-reprocessar/01-workflow.mjs
//
// Cria (idempotente) o workflow n8n "NFS-e - Reprocessar Entregas e Alertas
// (horario)": Schedule Trigger de hora em hora + HTTP Request POST em
// /api/notas-fiscais/reprocessar com o header x-cron-secret vindo de uma
// credencial httpHeaderAuth (mesmo padrao de 08-fallback-email-resumo-diario.mjs).
//
// Variaveis de ambiente necessarias:
//   N8N_BASE_URL               URL base do n8n
//   N8N_API_KEY                chave da API do n8n
//   APP_BASE_URL               URL base do app (ex.: https://psiagente.com.br)
//   NFSE_REPROCESS_CRON_SECRET mesmo valor configurado no app
//
// Rodar da raiz do repo: node scripts/n8n-nfse-reprocessar/01-workflow.mjs
// Ids criados ficam em scripts/n8n-nfse-reprocessar/ids.json (reexecucao
// reaproveita a credencial e atualiza o workflow).
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "../n8n-agente-whatsapp/lib.mjs";

const obrigatorias = ["N8N_BASE_URL", "N8N_API_KEY", "APP_BASE_URL", "NFSE_REPROCESS_CRON_SECRET"];
for (const nome of obrigatorias) {
  if (!process.env[nome]) {
    console.error(`Defina ${nome} no ambiente antes de rodar este script.`);
    process.exit(1);
  }
}

const appUrl = new URL(process.env.APP_BASE_URL);
const url = new URL("/api/notas-fiscais/reprocessar", appUrl).toString();

const idsPath = path.resolve("scripts/n8n-nfse-reprocessar/ids.json");
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, "utf8")) : {};
ids.credenciais = ids.credenciais || {};
ids.workflows = ids.workflows || {};
const salvar = () => fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));

const NOME_CREDENCIAL = "NFS-e Reprocess Cron Secret - psiagente";
const NOME_WORKFLOW = "NFS-e - Reprocessar Entregas e Alertas (horario)";

let credId = ids.credenciais.nfseReprocessCronSecret;
if (credId) {
  console.log(`Credencial "${NOME_CREDENCIAL}" já existe (${credId}), reaproveitando.`);
} else {
  const criada = await n8nRequest("POST", "/credentials", {
    name: NOME_CREDENCIAL,
    type: "httpHeaderAuth",
    data: {
      name: "x-cron-secret",
      value: process.env.NFSE_REPROCESS_CRON_SECRET,
      allowedHttpRequestDomains: "domains",
      allowedDomains: appUrl.hostname,
    },
  });
  credId = criada.id;
  ids.credenciais.nfseReprocessCronSecret = credId;
  salvar();
  console.log(`Credencial "${NOME_CREDENCIAL}" criada, id=${credId}`);
}

const definicao = {
  name: NOME_WORKFLOW,
  nodes: [
    {
      parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      id: "a7c3f001-0000-4000-8000-000000000001",
      name: "Agendamento",
    },
    {
      parameters: {
        method: "POST",
        url,
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [240, 0],
      id: "a7c3f001-0000-4000-8000-000000000002",
      name: "Chamar rota",
      credentials: { httpHeaderAuth: { id: credId, name: NOME_CREDENCIAL } },
    },
  ],
  connections: {
    Agendamento: { main: [[{ node: "Chamar rota", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

if (ids.workflows.nfseReprocessar) {
  const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows.nfseReprocessar}`, definicao);
  console.log(`Workflow "${NOME_WORKFLOW}" atualizado, id=${atualizado.id}`);
} else {
  const criado = await n8nRequest("POST", "/workflows", definicao);
  ids.workflows.nfseReprocessar = criado.id;
  salvar();
  console.log(`Workflow "${NOME_WORKFLOW}" criado, id=${criado.id}`);
  // Workflow criado via API nasce inativo; ativa explicitamente.
  await n8nRequest("PATCH", `/workflows/${criado.id}`, { active: true }).catch(async () => {
    await n8nRequest("POST", `/workflows/${criado.id}/activate`);
  });
  console.log(`Workflow "${NOME_WORKFLOW}" ativado.`);
}
