// scripts/n8n-agente-whatsapp/08-fallback-email-resumo-diario.mjs
//
// Item 24 (CRM de vendas): fila de reenvio de e-mail + resumo diario
// por WhatsApp. Cria as 2 credenciais de header (mesmo padrao de
// "proxySecret" em 01-criar-credenciais.mjs -- escopadas ao dominio,
// nao "none") e os 2 workflows de Schedule Trigger (mesmo padrao de
// "Assinaturas - Aplicar Pendencias (diario)", ja em producao).
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const obrigatorias = ["EMAIL_QUEUE_CRON_SECRET", "RESUMO_DIARIO_CRON_SECRET"];
for (const nome of obrigatorias) {
  if (!process.env[nome]) {
    console.error(`Defina ${nome} no ambiente antes de rodar este script.`);
    process.exit(1);
  }
}

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
ids.credenciais = ids.credenciais || {};
ids.workflows = ids.workflows || {};

async function criarOuReaproveitarCredencial(chave, payload) {
  if (ids.credenciais[chave]) {
    console.log(`Credencial "${payload.name}" já existe (${ids.credenciais[chave]}), reaproveitando.`);
    return ids.credenciais[chave];
  }
  const criada = await n8nRequest("POST", "/credentials", payload);
  console.log(`Credencial "${payload.name}" criada, id=${criada.id}`);
  ids.credenciais[chave] = criada.id;
  fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
  return criada.id;
}

const credEmailQueueId = await criarOuReaproveitarCredencial("emailQueueCronSecret", {
  name: "Email Queue Cron Secret - psiagente",
  type: "httpHeaderAuth",
  data: {
    name: "x-cron-secret",
    value: process.env.EMAIL_QUEUE_CRON_SECRET,
    allowedHttpRequestDomains: "domains",
    allowedDomains: "psiagente.com.br",
  },
});

const credResumoDiarioId = await criarOuReaproveitarCredencial("resumoDiarioCronSecret", {
  name: "Resumo Diario Cron Secret - psiagente",
  type: "httpHeaderAuth",
  data: {
    name: "x-cron-secret",
    value: process.env.RESUMO_DIARIO_CRON_SECRET,
    allowedHttpRequestDomains: "domains",
    allowedDomains: "psiagente.com.br",
  },
});

function workflowSchedule({ nome, credId, credNome, url, intervalo }) {
  return {
    name: nome,
    nodes: [
      {
        parameters: { rule: { interval: [intervalo] } },
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 0],
        id: "d2e2b001-0000-4000-8000-000000000001",
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
        id: "d2e2b001-0000-4000-8000-000000000002",
        name: "Chamar rota",
        credentials: {
          httpHeaderAuth: { id: credId, name: credNome },
        },
      },
    ],
    connections: {
      Agendamento: { main: [[{ node: "Chamar rota", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1" },
  };
}

async function criarOuAtualizarWorkflow(chave, definicao) {
  if (ids.workflows[chave]) {
    const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows[chave]}`, definicao);
    console.log(`Workflow "${definicao.name}" atualizado, id=${atualizado.id}`);
    return atualizado.id;
  }
  const criado = await n8nRequest("POST", "/workflows", definicao);
  console.log(`Workflow "${definicao.name}" criado, id=${criado.id}`);
  ids.workflows[chave] = criado.id;
  fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));

  // Workflow criado via API nasce inativo -- diferente de atualizar um
  // que já existe (PUT preserva o estado ativo). Ativa explicitamente.
  await n8nRequest("PATCH", `/workflows/${criado.id}`, { active: true }).catch(async () => {
    // Algumas versões da API do n8n só aceitam POST /activate.
    await n8nRequest("POST", `/workflows/${criado.id}/activate`);
  });
  console.log(`Workflow "${definicao.name}" ativado.`);
  return criado.id;
}

await criarOuAtualizarWorkflow(
  "reprocessarFilaEmail",
  workflowSchedule({
    nome: "Email - Reprocessar Fila (15min)",
    credId: credEmailQueueId,
    credNome: "Email Queue Cron Secret - psiagente",
    url: "https://psiagente.com.br/api/emails/reprocessar-fila",
    intervalo: { field: "minutes", minutesInterval: 15 },
  })
);

await criarOuAtualizarWorkflow(
  "resumoDiario",
  workflowSchedule({
    nome: "Relatorio - Resumo Diario (9h)",
    credId: credResumoDiarioId,
    credNome: "Resumo Diario Cron Secret - psiagente",
    url: "https://psiagente.com.br/api/relatorios/resumo-diario",
    intervalo: { field: "days", triggerAtHour: 9 },
  })
);
