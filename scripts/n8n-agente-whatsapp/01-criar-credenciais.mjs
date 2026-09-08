// scripts/n8n-agente-whatsapp/01-criar-credenciais.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const obrigatorias = [
  "AGENT_TOOL_SECRET",
  "EVOLUTION_API_KEY",
  "SUPABASE_DB_PASSWORD",
  "GEMINI_API_KEY",
  "WEBHOOK_SHARED_SECRET",
  "N8N_ONBOARDING_SECRET",
];
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
      name: "Supabase - psiagente (pooler)",
      type: "postgres",
      data: {
        // Pooler (Supavisor), não o host de conexão direta: o host direto
        // (db.rohulajgyxdangxfurha.supabase.co) é IPv6-only e o container do
        // n8n na VPS não tem rota de saída IPv6 (ENETUNREACH em produção,
        // achado + corrigido na revisão do Task 1 pós-Task 6). Host/porta
        // confirmados via supabase/.temp/pooler-url (CLI já resolveu a
        // região certa) e testados com uma conexão real antes do fix.
        host: "aws-1-sa-east-1.pooler.supabase.com",
        database: "postgres",
        user: "postgres.rohulajgyxdangxfurha",
        password: process.env.SUPABASE_DB_PASSWORD,
        port: 5432,
        // O pooler apresenta uma cadeia de certificado que falha a validação
        // padrão de CA do Node sob "require" estrito ("self-signed
        // certificate in certificate chain") — achado na revisão final do
        // branch, mascarado até então pelo onError: continueRegularOutput
        // dos nós Postgres do Router (o erro virava um item de saída normal
        // em vez de falhar visivelmente). É uma conexão de saída pro pooler
        // gerenciado da própria Supabase, já autenticada por senha — não é
        // uma fronteira de confiança pública, então desabilitar a validação
        // da cadeia aqui é aceitável. NOTA: o schema de credencial "postgres"
        // do n8n (GET /credentials/schema/postgres) exige que "ssl" fique
        // AUSENTE quando allowUnauthorizedCerts=true (mutuamente exclusivos —
        // confirmado tanto pelo JSON Schema quanto pelo código-fonte do nó,
        // packages/nodes-base/nodes/Postgres/transport/index.ts: quando
        // allowUnauthorizedCerts é true, o node monta
        // `ssl: { rejectUnauthorized: false }` diretamente e ignora o campo
        // "ssl" por completo) — TLS continua ativo, só a verificação da
        // cadeia de certificado é que é pulada.
        allowUnauthorizedCerts: true,
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
      // "none" bloqueava QUALQUER uso em nó HTTP Request/Tool HTTP Request
      // (achado + corrigido na revisão pós-Task 6) — o correto é escopar ao
      // único host que essa credencial de fato chama.
      data: {
        name: "x-agent-secret",
        value: process.env.AGENT_TOOL_SECRET,
        allowedHttpRequestDomains: "domains",
        allowedDomains: "psiagente.com.br",
      },
    },
  },
  {
    chave: "evolutionApiKey",
    payload: {
      name: "Evolution API - psifacil",
      type: "httpHeaderAuth",
      data: {
        name: "apikey",
        value: process.env.EVOLUTION_API_KEY,
        allowedHttpRequestDomains: "domains",
        allowedDomains: "psifacil-evolution-api.lcuzxl.easypanel.host",
      },
    },
  },
  {
    // Segredo compartilhado entre o webhook da Evolution API e o nó Webhook
    // do Router (autenticação "headerAuth") — achado crítico da revisão
    // final: o webhook não tinha nenhuma autenticação, então qualquer um que
    // descobrisse a URL podia forjar um payload messages.upsert se passando
    // por qualquer número (inclusive um já vinculado a um profissional) e
    // disparar qualquer tool, incluindo as destrutivas. Esse valor só existe
    // aqui (credencial n8n) e na config de webhook da Evolution API — não é
    // env var em nenhum outro lugar, por isso não está em nenhuma lista de
    // "obrigatorias" derivada de infra existente: foi gerado do zero pra
    // esta correção (mesmo padrão do AGENT_TOOL_SECRET).
    //
    // ACOPLAMENTO IMPORTANTE (achado da re-revisão): este script e
    // 05-configurar-webhook-e-ativar.mjs precisam rodar com o MESMO valor de
    // WEBHOOK_SHARED_SECRET. Rodar só este script de novo com um valor novo
    // rotaciona o segredo do lado do n8n silenciosamente, enquanto a
    // Evolution API continua mandando o valor antigo no header — toda
    // mensagem passa a tomar 403 do n8n sem nada na lista de execuções que
    // explique o motivo (o 403 acontece antes de qualquer nó do workflow
    // rodar, então não gera execução nenhuma pra inspecionar). Ao rotacionar
    // de propósito, rode os dois scripts na mesma sessão de shell, com a
    // mesma env var exportada pros dois.
    chave: "webhookSecret",
    payload: {
      name: "Webhook Evolution -> n8n (shared secret)",
      type: "httpHeaderAuth",
      data: {
        name: "x-webhook-secret",
        value: process.env.WEBHOOK_SHARED_SECRET,
        // Esta credencial só é usada pelo nó Webhook (autenticação de
        // entrada, "headerAuth") — nunca deve ser usável dentro de um nó
        // HTTP Request/Tool de saída, então "none" aqui (diferente de
        // evolutionApiKey/proxySecret acima, que SÃO usadas em nós de saída
        // e por isso escopadas a "domains").
        allowedHttpRequestDomains: "none",
      },
    },
  },
  {
    // Autentica o gatilho Webhook do WA - Onboarding, chamado por
    // /auth/callback (Next.js) quando um link magico relacionado a
    // WhatsApp e clicado. Mesmo padrao do webhookSecret acima (headerAuth,
    // "none" em allowedHttpRequestDomains -- so autentica entrada, nunca
    // usada em no de saida). Valor = N8N_ONBOARDING_SECRET, precisa ficar
    // identico ao que for configurado em EasyPanel (env var do app).
    chave: "onboardingWebhookSecret",
    payload: {
      name: "Onboarding WhatsApp -> n8n (shared secret)",
      type: "httpHeaderAuth",
      data: {
        name: "x-onboarding-secret",
        value: process.env.N8N_ONBOARDING_SECRET,
        allowedHttpRequestDomains: "none",
      },
    },
  },
];

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, "utf8")) : {};
ids.credenciais = ids.credenciais || {};

// Idempotente: se a credencial já existe (id gravado em ids.json), atualiza
// via PATCH em vez de criar uma duplicada via POST — permite reexecutar este
// script depois de corrigir bugs de payload (ex.: Criticals #2/#5 pós-review)
// sem duplicar/orfanar as credenciais que os workflows já referenciam por id.
for (const { chave, payload } of credenciais) {
  const idExistente = ids.credenciais[chave];
  if (idExistente) {
    await n8nRequest("PATCH", `/credentials/${idExistente}`, payload);
    console.log(`Credencial "${payload.name}" atualizada, id=${idExistente}`);
  } else {
    const criado = await n8nRequest("POST", "/credentials", payload);
    ids.credenciais[chave] = criado.id;
    console.log(`Credencial "${payload.name}" criada, id=${criado.id}`);
  }
}

fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2));
console.log(`Gravado em ${idsPath}`);
