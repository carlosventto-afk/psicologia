// scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { postgres: credPostgresId, gemini: credGeminiId, proxySecret: credProxyId } = ids.credenciais;

// Catálogo das 18 tools: nome do parâmetro, tipo pro $fromAI, descrição pro Gemini.
// Copiado das Global Constraints do plano (assinaturas confirmadas via pg_proc em produção).
const tools = [
  {
    nome: "agent_listar_consultorios",
    descricao: "Lista os consultórios do profissional. Use para descobrir o id de um consultório, ou quando a tool anterior falhar com CONSULTORIO_AMBIGUO.",
    params: [],
  },
  {
    nome: "agent_definir_consultorio_ativo",
    descricao: "Define qual consultório fica ativo para as próximas mensagens desta conversa. Chame depois de agent_listar_consultorios quando o profissional escolher um, em resposta a CONSULTORIO_AMBIGUO.",
    params: [{ nome: "p_consultorio_id", tipo: "number", desc: "Id do consultório escolhido pelo profissional." }],
  },
  {
    nome: "agent_buscar_paciente",
    descricao: "Busca pacientes pelo nome (busca aproximada). Use para descobrir o id de um paciente antes de agendar, consultar débitos, etc.",
    params: [{ nome: "p_nome", tipo: "string", desc: "Nome ou parte do nome do paciente." }],
  },
  {
    nome: "agent_get_agenda",
    descricao: "Lista os atendimentos agendados em um período. Use para responder perguntas sobre a agenda (hoje, amanhã, esta semana, etc).",
    params: [
      { nome: "p_data_inicio", tipo: "string", desc: "Data inicial no formato YYYY-MM-DD." },
      { nome: "p_data_fim", tipo: "string", desc: "Data final no formato YYYY-MM-DD (pode ser igual à inicial para um único dia)." },
    ],
  },
  {
    nome: "agent_status_pagamento_paciente",
    descricao: "Lista as sessões de um paciente com o status de pagamento de cada uma.",
    params: [{ nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." }],
  },
  {
    nome: "agent_listar_debitos_paciente",
    descricao: "Lista as sessões em aberto (não pagas) de um paciente específico.",
    params: [{ nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." }],
  },
  {
    nome: "agent_registrar_pagamento_sessao",
    descricao: "Registra o pagamento de uma sessão específica.",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão que está sendo paga." },
      { nome: "p_valor", tipo: "number", desc: "Valor pago, em reais." },
      { nome: "p_forma_pagamento", tipo: "string", desc: "Forma de pagamento (ex: pix, dinheiro, cartão)." },
      { nome: "p_conta_id", tipo: "number", desc: "Id da conta financeira que recebeu o pagamento." },
    ],
  },
  {
    nome: "agent_marcar_atendimento_realizado",
    descricao: "Marca uma sessão como realizada (atendimento aconteceu).",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão." },
      { nome: "p_anotacoes", tipo: "string", desc: "Anotações opcionais sobre o atendimento (pode ser vazio)." },
    ],
  },
  {
    nome: "agent_agendar_sessao_avulsa",
    descricao: "Cria um novo agendamento avulso para um paciente.",
    params: [
      { nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." },
      { nome: "p_data", tipo: "string", desc: "Data do atendimento no formato YYYY-MM-DD." },
      { nome: "p_horario", tipo: "string", desc: "Horário no formato HH:MM." },
      { nome: "p_duracao_min", tipo: "number", desc: "Duração em minutos. Se o profissional não falar, use 50." },
    ],
  },
  {
    nome: "agent_cancelar_sessao",
    descricao: "Cancela uma sessão (não substitui por outra data — para isso use agent_reagendar_sessao). SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a cancelar." }],
  },
  {
    nome: "agent_reagendar_sessao",
    descricao: "Muda a data/hora de uma sessão existente para outra data/hora, mantendo o mesmo atendimento (diferente de cancelar). Se o resultado trouxer alerta=true, avise o profissional que este paciente já remarcou muitas vezes neste mês.",
    params: [
      { nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a reagendar." },
      { nome: "p_data_nova", tipo: "string", desc: "Nova data no formato YYYY-MM-DD." },
      { nome: "p_horario_novo", tipo: "string", desc: "Novo horário no formato HH:MM." },
    ],
  },
  {
    nome: "agent_excluir_sessao",
    descricao: "Exclui definitivamente uma sessão (diferente de cancelar). Só funciona se a sessão não tiver pagamento/recibo vinculado. SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão a excluir." }],
  },
  {
    nome: "agent_gerar_recibo",
    descricao: "Gera um recibo para uma sessão.",
    params: [{ nome: "p_sessao_id", tipo: "number", desc: "Id da sessão." }],
  },
  {
    nome: "agent_excluir_pagamento",
    descricao: "Exclui (desfaz) um pagamento já registrado, fazendo a sessão voltar a aparecer como não paga. SEMPRE confirme com o profissional antes de chamar esta tool.",
    params: [{ nome: "p_pagamento_id", tipo: "number", desc: "Id do pagamento a excluir." }],
  },
  {
    nome: "agent_registrar_lancamento_despesa",
    descricao: "Registra uma despesa financeira (não é uma sessão).",
    params: [
      { nome: "p_descricao", tipo: "string", desc: "Descrição da despesa." },
      { nome: "p_valor", tipo: "number", desc: "Valor da despesa, em reais." },
      { nome: "p_data", tipo: "string", desc: "Data da despesa no formato YYYY-MM-DD. Se o profissional não falar, use hoje." },
    ],
  },
  {
    nome: "agent_listar_inadimplentes",
    descricao: "Lista todos os pacientes com sessões em aberto (não pagas).",
    params: [],
  },
  {
    nome: "agent_resumo_financeiro",
    descricao: "Resumo financeiro (receitas/despesas) em um período.",
    params: [
      { nome: "p_data_inicio", tipo: "string", desc: "Data inicial no formato YYYY-MM-DD." },
      { nome: "p_data_fim", tipo: "string", desc: "Data final no formato YYYY-MM-DD." },
    ],
  },
  {
    nome: "agent_registrar_anamnese",
    descricao: "Preenche ou atualiza campos da anamnese de um paciente. Chaves válidas em p_campos: queixa_inicial, historico_saude, historico_familiar, medico_responsavel, medicamentos_em_uso, diagnosticos_previos, tratamentos_anteriores, expectativas_tratamento, rede_apoio, observacoes_gerais, encaminhamento. Não use nenhuma outra chave.",
    params: [
      { nome: "p_paciente_id", tipo: "number", desc: "Id do paciente." },
      { nome: "p_campos", tipo: "json", desc: "Objeto JSON só com as chaves da anamnese que o profissional quer preencher/atualizar nesta mensagem." },
      { nome: "p_observacao", tipo: "string", desc: "Observação livre opcional sobre esta atualização de anamnese." },
    ],
  },
];

function construirNoTool(tool, posY) {
  const paramsExpr = tool.params
    .map((p) => `"${p.nome}": $fromAI('${p.nome}', ${JSON.stringify(p.desc)}, '${p.tipo}')`)
    .join(", ");
  // Important #2 (revisão final): era "$('Execute Workflow Trigger').item...".
  // Nós de tool são chamados pelo AI Agent fora do fluxo linear principal de
  // dados, então o rastreamento de "paired item" do n8n até o trigger pode
  // falhar aí com "Can't determine which item to use". ".first()" é a forma
  // que resolve de forma confiável a partir de um nó de sub-tool, mantendo a
  // mesma propriedade de segurança (item único, sempre vindo do trigger,
  // nunca de $fromAI).
  const jsonBody =
    `={{ { "tool_name": "${tool.nome}", "whatsapp_number": $('Execute Workflow Trigger').first().json.whatsapp_number, "params": { ${paramsExpr} } } }}`;
  return {
    parameters: {
      toolDescription: tool.descricao,
      method: "POST",
      url: "=https://psiagente.com.br/api/agent/call-tool",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: {},
    },
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    typeVersion: 1.1,
    position: [posY % 5 * 220, 320 + Math.floor(posY / 5) * 160],
    id: `a9e17${String(posY).padStart(3, "0")}-0000-4000-8000-000000000000`,
    name: tool.nome,
    credentials: {
      httpHeaderAuth: { id: credProxyId, name: "Agent Tool Secret - proxy Next.js" },
    },
  };
}

// "usuario_nome" chega no trigger mas antes nunca era usado no prompt —
// interpolado aqui via expressão n8n (por isso o "=" na atribuição de
// options.systemMessage abaixo, que faz o campo ser avaliado como
// expressão em vez de texto literal).
const SYSTEM_PROMPT = `Você é o(a) secretário(a) virtual de um consultório de psicologia, atendendo {{ $json.usuario_nome }}, o(a) profissional (psicólogo/a), pelo WhatsApp. Tom profissional e cordial, respostas curtas (é WhatsApp, não e-mail), sem markdown pesado (nada de #, **, tabelas).

Nunca exponha id interno de sessão/paciente/consultório na resposta — fale em nomes e datas, o profissional não sabe (nem precisa saber) o número de linha do banco.

Protocolo de consultório ambíguo: se qualquer tool falhar com o erro CONSULTORIO_AMBIGUO, chame agent_listar_consultorios, pergunte ao profissional qual consultório ele quer usar, chame agent_definir_consultorio_ativo com a escolha dele, e só então tente de novo a ação original.

Confirmação antes de ação destrutiva: antes de chamar agent_excluir_sessao, agent_excluir_pagamento ou agent_cancelar_sessao, repita o que você vai fazer e peça confirmação explícita (ex: "Confirma que quer excluir o atendimento do dia 10/03 com a Maria?") e só execute depois que o profissional confirmar claramente.

Tradução de erro: nunca mostre um código de erro cru. Traduza para frase humana, por exemplo: WHATSAPP_NAO_VINCULADO -> "seu WhatsApp ainda não está vinculado a uma conta"; SESSAO_NAO_ENCONTRADA -> "não encontrei esse atendimento"; SESSAO_NAO_REAGENDAVEL -> "esse atendimento já foi realizado ou cancelado, não dá pra reagendar"; SESSAO_TEM_VINCULO_FINANCEIRO -> "esse atendimento tem pagamento ou recibo vinculado, não dá pra excluir — mas posso cancelar, se preferir"; PAGAMENTO_TEM_NOTA_FISCAL -> "esse pagamento tem nota fiscal emitida, não dá pra excluir"; PACIENTE_INVALIDO -> "não encontrei esse paciente"; CAMPO_ANAMNESE_INVALIDO ou CAMPOS_INVALIDOS -> "não entendi esse campo da anamnese, pode reformular?"; CONTA_INVALIDA -> "não encontrei essa conta financeira"; PAGAMENTO_NAO_ENCONTRADO -> "não encontrei esse pagamento"; SEM_CONSULTORIO_CADASTRADO -> "você ainda não tem nenhum consultório cadastrado no sistema".

Quando agent_reagendar_sessao retornar alerta=true no resultado, avise o profissional de forma gentil que esse paciente já remarcou várias vezes este mês.`;

const workflow = {
  name: "WA - Agent Psicólogo",
  nodes: [
    {
      parameters: {
        workflowInputs: {
          values: [
            { name: "whatsapp_number" },
            { name: "mensagem_texto" },
            { name: "usuario_nome" },
          ],
        },
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      id: "a9e17000-0000-4000-8000-000000000001",
      name: "Execute Workflow Trigger",
    },
    {
      parameters: {
        promptType: "define",
        text: "={{ $json.mensagem_texto }}",
        options: { systemMessage: "=" + SYSTEM_PROMPT },
      },
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 2.1,
      position: [240, 0],
      id: "a9e17000-0000-4000-8000-000000000002",
      name: "AI Agent",
    },
    {
      parameters: {
        modelId: { __rl: true, mode: "id", value: "models/gemini-3.5-flash-lite" },
        options: {},
      },
      type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      typeVersion: 1,
      position: [120, 200],
      id: "a9e17000-0000-4000-8000-000000000003",
      name: "Google Gemini Chat Model",
      credentials: {
        googlePalmApi: { id: credGeminiId, name: "Google Gemini - agente WhatsApp" },
      },
    },
    {
      parameters: {
        sessionIdType: "customKey",
        sessionKey: "={{ $('Execute Workflow Trigger').item.json.whatsapp_number }}",
        tableName: "n8n_chat_histories",
        contextWindowLength: 10,
      },
      type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
      typeVersion: 1.3,
      position: [280, 200],
      id: "a9e17000-0000-4000-8000-000000000004",
      name: "Postgres Chat Memory",
      credentials: {
        postgres: { id: credPostgresId, name: "Supabase - psiagente (pooler)" },
      },
    },
    ...tools.map((t, i) => construirNoTool(t, i)),
  ],
  connections: {
    "Execute Workflow Trigger": {
      main: [[{ node: "AI Agent", type: "main", index: 0 }]],
    },
    "Google Gemini Chat Model": {
      ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
    },
    "Postgres Chat Memory": {
      ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]],
    },
    ...Object.fromEntries(
      tools.map((t) => [t.nome, { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]] }])
    ),
  },
  settings: { executionOrder: "v1" },
};

// Idempotente: se o workflow já existe (ids.json.workflows.agentPsicologo),
// atualiza via PUT em vez de criar um duplicado via POST (Important #5,
// revisão final — mesmo padrão já usado em 04-workflow-inbound-router.mjs).
const idsPath2 = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
ids.workflows = ids.workflows || {};
if (ids.workflows.agentPsicologo) {
  const atualizado = await n8nRequest("PUT", `/workflows/${ids.workflows.agentPsicologo}`, workflow);
  console.log(`Workflow "WA - Agent Psicólogo" atualizado, id=${atualizado.id}, nós=${workflow.nodes.length}`);
} else {
  const criado = await n8nRequest("POST", "/workflows", workflow);
  console.log(`Workflow "WA - Agent Psicólogo" criado, id=${criado.id}, nós=${workflow.nodes.length}`);
  ids.workflows.agentPsicologo = criado.id;
  fs.writeFileSync(idsPath2, JSON.stringify(ids, null, 2));
}
