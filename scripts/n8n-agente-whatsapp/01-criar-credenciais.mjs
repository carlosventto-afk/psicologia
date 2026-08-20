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
        sshTunnel: false,
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
        allowedHttpRequestDomains: "none",
      },
    },
  },
  {
    chave: "proxySecret",
    payload: {
      name: "Agent Tool Secret - proxy Next.js",
      type: "httpHeaderAuth",
      data: { name: "x-agent-secret", value: process.env.AGENT_TOOL_SECRET, allowedHttpRequestDomains: "none" },
    },
  },
  {
    chave: "evolutionApiKey",
    payload: {
      name: "Evolution API - psifacil",
      type: "httpHeaderAuth",
      data: { name: "apikey", value: process.env.EVOLUTION_API_KEY, allowedHttpRequestDomains: "none" },
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
