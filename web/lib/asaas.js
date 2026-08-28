// web/lib/asaas.js
const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";

function headers() {
  return {
    "Content-Type": "application/json",
    access_token: process.env.ASAAS_API_KEY,
  };
}

async function asaasFetch(path, options = {}) {
  const resposta = await fetch(`${ASAAS_API_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados.errors?.[0]?.description || `Erro na API do Asaas (${resposta.status})`);
  }
  return dados;
}

export async function criarClienteAsaas({ nome, cpf }) {
  return asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({ name: nome, cpfCnpj: String(cpf ?? "").replace(/\D/g, "") }),
  });
}

export async function criarAssinaturaAsaas({ customerId, value, description }) {
  return asaasFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      value,
      description,
      nextDueDate: new Date().toISOString().slice(0, 10),
    }),
  });
}

export async function buscarAssinaturaAsaas(subscriptionId) {
  return asaasFetch(`/subscriptions/${subscriptionId}`);
}

// A resposta de POST /subscriptions não traz o link de checkout (não existe
// campo `invoiceUrl` na subscription em si) -- o link fica no primeiro
// payment gerado pra assinatura, obtido via GET /subscriptions/{id}/payments.
// Verificado com uma chamada real (subscription + payments) contra a API de
// produção do Asaas.
export async function buscarPrimeiroPagamentoAssinatura(subscriptionId) {
  const resposta = await asaasFetch(`/subscriptions/${subscriptionId}/payments`);
  return resposta.data?.[0] ?? null;
}

export async function atualizarAssinaturaAsaas(subscriptionId, { value }) {
  return asaasFetch(`/subscriptions/${subscriptionId}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function cancelarAssinaturaAsaas(subscriptionId) {
  return asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
}
