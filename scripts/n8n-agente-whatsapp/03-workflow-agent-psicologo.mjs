// scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs
import fs from "node:fs";
import path from "node:path";
import { n8nRequest } from "./lib.mjs";

const idsPath = path.resolve("scripts/n8n-agente-whatsapp/ids.json");
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const { postgres: credPostgresId, gemini: credGeminiId, proxySecret: credProxyId } = ids.credenciais;

// Catálogo das 16 tools: nome do parâmetro, tipo (vira "Placeholder Definitions" em construirNoTool), descrição pro Gemini.
// Copiado das Global Constraints do plano (assinaturas confirmadas via pg_proc em produção).
const tools = [
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
  {
    nome: "agent_criar_consultorio",
    descricao: "Cria um consultório novo pro profissional durante o onboarding inicial. Só chame se o profissional estiver configurando o primeiro consultório (onboarding_etapa = consultorio).",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome do consultório." },
      { nome: "p_telefone", tipo: "string", desc: "Telefone de atendimento. Se o profissional não falar, envie string vazia." },
      { nome: "p_email_atendimento", tipo: "string", desc: "E-mail de atendimento. Se o profissional não falar, envie string vazia." },
      { nome: "p_endereco", tipo: "string", desc: "Endereço do consultório. Se o profissional não falar, envie string vazia." },
    ],
  },
  {
    nome: "agent_criar_paciente",
    descricao: "Cria um paciente novo. Durante o onboarding (onboarding_etapa = paciente), use pra cadastrar o primeiro paciente se o profissional quiser.",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome do paciente." },
      { nome: "p_telefone", tipo: "string", desc: "Telefone do paciente. Se não informado, envie string vazia." },
      { nome: "p_email", tipo: "string", desc: "E-mail do paciente. Se não informado, envie string vazia." },
      { nome: "p_valor_sessao", tipo: "number", desc: "Valor da sessão em reais. Se não informado, envie 0." },
    ],
  },
  {
    nome: "agent_criar_conta_bancaria",
    descricao: "Cria uma conta financeira/bancária pro profissional. Durante o onboarding (onboarding_etapa = conta), só nome e banco são obrigatórios.",
    params: [
      { nome: "p_nome", tipo: "string", desc: "Nome/apelido da conta (ex: Conta Corrente)." },
      { nome: "p_banco", tipo: "string", desc: "Nome do banco." },
      { nome: "p_agencia", tipo: "string", desc: "Agência. Se não informado, envie string vazia." },
      { nome: "p_numero", tipo: "string", desc: "Número da conta. Se não informado, envie string vazia." },
      { nome: "p_tipo", tipo: "string", desc: "Tipo da conta (corrente/poupança). Se não informado, envie string vazia." },
    ],
  },
  {
    nome: "agent_avancar_onboarding",
    descricao: "Avança o profissional pra próxima etapa do onboarding guiado. Chame SEMPRE depois de terminar (criou o registro) ou pular uma etapa — nunca decida sozinho, sempre chame esta tool pra confirmar o avanço.",
    params: [
      { nome: "p_etapa_atual", tipo: "string", desc: "A etapa atual do onboarding (o valor de onboarding_etapa que você recebeu: consultorio, paciente ou conta)." },
    ],
  },
];

// Achado lendo o código-fonte real do node (dist/nodes/tools/ToolHttpRequest/
// utils.js dentro do container n8n): com specifyBody:"json", o node chama
// ctx.getNodeParameter("jsonBody", ...) — que RESOLVE a expressão n8n antes de
// qualquer coisa. A versão anterior usava "={{ { ...$fromAI(...)... } }}",
// uma expressão que avalia pra um OBJETO JS de verdade. O node então guarda
// esse objeto como "rawRequestOptions.body" e tenta rodar sua própria
// substituição de placeholders (mecanismo dele, com token de chave simples
// tipo "{nome}", carimbado via "Placeholder Definitions" — different de
// $fromAI) em cima disso: como não é string, extractParametersFromText()
// devolve [] (nenhum parâmetro extraído), e no fim ele tenta
// jsonParse(String(nossoObjeto)) — que vira o literal "[object Object]" e
// falha, sempre, pra toda tool com pelo menos 1 param. Confirmado em
// produção: 100% das chamadas de tool com parâmetro falhavam com "Could not
// replace placeholders in body". Fix: jsonBody agora resolve pra uma STRING
// (via concatenação, não um objeto), com um "{nome}" literal por parâmetro —
// a sintaxe de placeholder que esse node específico realmente espera — e
// "Placeholder Definitions" declara nome/tipo/descrição de cada um (o que
// substitui $fromAI aqui). Sem aspas ao redor de "{nome}" no template: o node
// só adiciona aspas sozinho quando o tipo declarado é "string" e ainda não
// há aspas ali, então tipos number/json saem sem aspas (JSON válido) e string
// sai citada — automático, não precisa fazer isso na mão por tipo.
function construirNoTool(tool, posY) {
  // Achado #2 (rodando o splitExpression real do n8n — n8n-workflow's
  // ExpressionParser — contra essa string dentro do container): o parser de
  // "={{ ... }}" do n8n acha o fim do bloco de código procurando a primeira
  // ocorrência do literal "}}" — sem entender que está dentro de uma string
  // JS. Como "params": {...} sempre fecha com o "}" do último placeholder
  // seguido imediatamente pelo "}" que fecha o objeto "params" (ex.:
  // "...{p_data_fim}}"), esses dois "}" adjacentes já formam um "}}" que o
  // parser lê como SE FOSSE o fechamento do "={{ }}" — cortando a expressão
  // no meio e sobrando lixo depois, daí o "invalid syntax"/
  // ExpressionExtensionError visto em produção pra toda tool com >=1 param
  // (não só a que aparecia no log — é a primeira que o n8n tenta resolver).
  // Fix: um espaço entre "}" adjacentes evita qualquer "}}" literal no meio
  // do texto (só o "}}" real, no fim, sobra) — JSON ignora espaço em branco
  // entre tokens, então isso não muda o JSON final nem afeta a substituição
  // de placeholder (que já tolerava espaço).
  const paramsBody = tool.params.map((p) => `"${p.nome}": {${p.nome}}`).join(", ");
  const jsonBody =
    `={{ '{"tool_name": "${tool.nome}", "whatsapp_number": ' + JSON.stringify($('Execute Workflow Trigger').first().json.whatsapp_number) + ', "params": { ${paramsBody} } }' }}`;
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
      placeholderDefinitions: {
        values: tool.params.map((p) => ({ name: p.nome, description: p.desc, type: p.tipo })),
      },
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

Hoje é {{ $now.toFormat('yyyy-MM-dd') }} ({{ $now.setLocale('pt-BR').toFormat('cccc') }}). Use essa data como base pra resolver "hoje", "amanhã", "ontem", "essa semana", "esse mês" etc. antes de chamar qualquer ferramenta que peça data — nunca chame uma ferramenta que precisa de data sem calcular o valor primeiro (ex.: p_data_inicio/p_data_fim de agent_get_agenda e agent_resumo_financeiro nunca podem ficar vazios).

Nunca exponha id interno de sessão/paciente/consultório na resposta — fale em nomes e datas, o profissional não sabe (nem precisa saber) o número de linha do banco.

Consultório: se o profissional tiver mais de um consultório cadastrado, NÃO pergunte qual está "ativo" nem peça pra ele escolher um — nenhuma das suas ferramentas pede id de consultório, todas já retornam os dados de todos os consultórios dele automaticamente. Chame a ferramenta direto.

Nunca invente ou simule uma mensagem de erro técnico (ex.: "instabilidade", "Request failed with status code X", "problema no sistema"). Se precisar de um dado pra responder, CHAME a ferramenta correspondente antes de responder — nunca diga que uma ferramenta falhou sem realmente ter chamado ela. Se uma ferramenta não existir para o que foi pedido, diga isso claramente (ex: "ainda não consigo fazer isso por aqui") em vez de fingir uma falha técnica.

Confirmação antes de ação destrutiva: antes de chamar agent_excluir_sessao, agent_excluir_pagamento ou agent_cancelar_sessao, repita o que você vai fazer e peça confirmação explícita (ex: "Confirma que quer excluir o atendimento do dia 10/03 com a Maria?") e só execute depois que o profissional confirmar claramente.

Tradução de erro: nunca mostre um código de erro cru. Traduza para frase humana, por exemplo: WHATSAPP_NAO_VINCULADO -> "seu WhatsApp ainda não está vinculado a uma conta"; SESSAO_NAO_ENCONTRADA -> "não encontrei esse atendimento"; SESSAO_NAO_REAGENDAVEL -> "esse atendimento já foi realizado ou cancelado, não dá pra reagendar"; SESSAO_TEM_VINCULO_FINANCEIRO -> "esse atendimento tem pagamento ou recibo vinculado, não dá pra excluir — mas posso cancelar, se preferir"; PAGAMENTO_TEM_NOTA_FISCAL -> "esse pagamento tem nota fiscal emitida, não dá pra excluir"; PACIENTE_INVALIDO -> "não encontrei esse paciente"; CAMPO_ANAMNESE_INVALIDO ou CAMPOS_INVALIDOS -> "não entendi esse campo da anamnese, pode reformular?"; CONTA_INVALIDA -> "não encontrei essa conta financeira"; PAGAMENTO_NAO_ENCONTRADO -> "não encontrei esse pagamento"; SEM_CONSULTORIO_CADASTRADO -> "você ainda não tem nenhum consultório cadastrado no sistema"; PLANO_SEM_WHATSAPP -> "seu plano atual não inclui o atendimento por WhatsApp — dá pra ver os planos direto no aplicativo".

Quando agent_reagendar_sessao retornar alerta=true no resultado, avise o profissional de forma gentil que esse paciente já remarcou várias vezes este mês.

Onboarding guiado: se {{ $json.onboarding_etapa }} for "consultorio", "paciente" ou "conta", o profissional ainda está no onboarding inicial — priorize guiar essa etapa (pergunte o que falta, ofereça pular), mas sem travar: se ele perguntar outra coisa, responda normalmente com as demais ferramentas e só retome o onboarding na resposta seguinte. Em cada etapa: crie o registro correspondente (agent_criar_consultorio/agent_criar_paciente/agent_criar_conta_bancaria) OU, se o profissional quiser pular, não crie nada — nos dois casos, chame agent_avancar_onboarding em seguida passando a etapa atual. Quando agent_avancar_onboarding retornar "concluido", mande uma mensagem final resumindo o que foi criado e avisando que o resto pode ser feito a qualquer momento, só pedindo (ex: "cadastra paciente X") ou pelo aplicativo. Se {{ $json.onboarding_etapa }} for vazio ou "concluido", não mencione onboarding nenhum.

Traduções de erro adicionais: SEM_CONSULTORIO_CADASTRADO -> "você ainda não tem nenhum consultório cadastrado"; CONSULTORIO_INVALIDO -> "não encontrei esse consultório"; NOME_OBRIGATORIO -> "preciso do nome pra continuar"; BANCO_OBRIGATORIO -> "preciso saber o banco pra continuar"; ONBOARDING_ETAPA_INVALIDA -> não mostre isso ao profissional, apenas siga com a etapa que o onboarding_etapa atual indica.`;

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
            { name: "onboarding_etapa" },
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
      // Novo blocker achado na re-revisão: o nó lê o modelo do parâmetro
      // "modelName" (string simples), não "modelId" (resource locator) — o
      // valor antigo era silenciosamente ignorado e o nó caía no default
      // hardcoded da própria definição do nó pra typeVersion 1
      // (LmChatGoogleGemini.node.ts: `default: 'models/gemini-2.5-flash'`),
      // que é exatamente o modelo que a chamada real rejeitou com 404
      // durante a verificação anterior. Confirmado lendo o código-fonte real
      // do nó (packages/@n8n/nodes-langchain/nodes/llms/LmChatGoogleGemini/
      // LmChatGoogleGemini.node.ts): `name: 'modelName'`,
      // `this.getNodeParameter('modelName', itemIndex)`. O model id em si
      // ("models/gemini-3.5-flash-lite") já tinha sido confirmado existente
      // via chamada real à API ListModels do Google na revisão final — só o
      // nome/formato do parâmetro estava errado.
      parameters: {
        modelName: "models/gemini-3.5-flash-lite",
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
        // Mesma classe de bug do Important #2 (.item pode falhar a partir de
        // um nó de sub-node/cluster fora do fluxo linear principal — aqui é
        // ainda mais sensível: este nó não tem onError, então um
        // misresolve derruba o workflow inteiro em vez de só uma tool).
        sessionKey: "={{ $('Execute Workflow Trigger').first().json.whatsapp_number }}",
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
