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
