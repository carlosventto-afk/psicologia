// scripts/n8n-agente-whatsapp/lib.mjs
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;
const EVOLUTION_BASE_URL = process.env.EVOLUTION_BASE_URL || "https://psifacil-evolution-api.lcuzxl.easypanel.host";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

export async function n8nRequest(method, path, body) {
  if (!N8N_BASE_URL || !N8N_API_KEY) {
    throw new Error("Defina N8N_BASE_URL e N8N_API_KEY antes de rodar (source do arquivo scratch).");
  }
  const res = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { rawText: texto };
  }
  if (!res.ok) {
    const erro = new Error(`n8n API ${method} ${path} -> ${res.status}`);
    erro.status = res.status;
    erro.body = json;
    throw erro;
  }
  return json;
}

export async function evolutionRequest(method, path, body) {
  if (!EVOLUTION_API_KEY) {
    throw new Error("Defina EVOLUTION_API_KEY antes de rodar.");
  }
  const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    method,
    headers: {
      apikey: EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { rawText: texto };
  }
  if (!res.ok) {
    const erro = new Error(`Evolution API ${method} ${path} -> ${res.status}`);
    erro.status = res.status;
    erro.body = json;
    throw erro;
  }
  return json;
}
