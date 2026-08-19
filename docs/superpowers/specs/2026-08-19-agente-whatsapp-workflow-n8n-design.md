# Agente de WhatsApp — workflow n8n (item 13, metade 2)

Status: aprovado para plano de implementação
Data: 2026-08-19
Pedido do usuário, item 13 (metade 2) do backlog
(`docs/backlog-novas-funcionalidades.md`). Continua a metade 1 (5 RPCs
novas + as 12 já existentes, ver
`docs/superpowers/specs/2026-08-17-agente-whatsapp-profissional-design.md`)
— esta parte é a orquestração que efetivamente liga o WhatsApp a essas 17
tools (contagem confirmada direto em produção via `pg_proc`/`has_function_privilege`
em 2026-08-19 — a spec da metade 1 e a revisão final chamavam de "11+5=16",
número que não bate com a contagem real). Reaproveita fortemente a arquitetura já pensada em
`C:\Users\Administrador\.claude\plans\preciso-criar-um-ecossistema-tidy-bachman.md`
("Fase A"), adaptada às decisões novas desta sessão (ver abaixo).

## Objetivo

O profissional manda uma mensagem de texto pro número de WhatsApp vinculado
e recebe uma resposta do agente, que decide sozinho quais das 17 tools
chamar pra responder ou executar a ação pedida.

## Decisões desta sessão (2026-08-19), divergindo do plano original

- **LLM: Google Gemini 3.5 Flash-Lite**, não Claude (decisão explícita do
  usuário, por custo — $0,30/$2,50 por milhão de tokens de
  entrada/saída, confirmado via busca em 2026-08-19; o Gemini 2.5 Flash
  mais antigo tem aposentadoria marcada pra 16/10/2026, por isso a escolha
  do 3.5 Flash-Lite em vez dele). Nó nativo do n8n
  (`n8n-nodes-langchain.lmChatGoogleGemini`), credencial só com API key do
  Google AI Studio.
- **Só texto nesta entrega** — sem transcrição de áudio (usuário não tem
  API key da OpenAI/Whisper ainda). Mensagem de tipo não-texto recebe uma
  resposta fixa pedindo pra mandar em texto.
- **Só canal do profissional** — canal do paciente, resumo diário
  proativo e relatórios continuam fora de escopo (já decidido em
  2026-08-17, no design da metade 1).
- **Acesso confirmado:** API key do n8n gerada e testada (lista o workflow
  do item 9 já existente). API key do Gemini gerada e testada.

## Arquitetura: tools via proxy no Next.js, não n8n direto no Supabase

Decisão de arquitetura (aprovada pelo usuário): em vez de cada tool ser um
nó HTTP chamando o Supabase direto de dentro do workflow n8n, existe uma
rota nova no Next.js (`POST /api/agent/call-tool`) que funciona como proxy
único — recebe `{tool_name, whatsapp_number, params}`, valida `tool_name`
contra uma lista fechada das 17 tools conhecidas, chama o RPC certo com
`service_role`, grava em `agent_audit_log`, e devolve o resultado (ou um
erro traduzido) pro n8n. Cada tool no workflow n8n vira só um nó HTTP
apontando pra essa mesma rota, com `tool_name` fixo e a descrição/schema
que o Gemini usa pra decidir quando chamar.

**Por que:** fica testável/versionado como o resto do projeto (código em
git, não configuração espalhada em JSON de workflow), reaproveita
exatamente o padrão já usado no item 9 (`web/app/carne-leao-automatico/route.js`
— segredo compartilhado em header, `createAdminClient()`), e adicionar uma
tool nova no futuro não exige tocar no n8n.

**Efeito colateral bom:** como o proxy já tem acesso `service_role`, ele
grava direto em `agent_audit_log` via `.insert()` — não precisa de uma RPC
`agent_log_tool_call` como o plano original previa (isso só fazia sentido
se o n8n chamasse o Supabase direto via PostgREST com uma role mais
restrita). Uma peça a menos pra construir.

### Rota `POST /api/agent/call-tool`

`web/app/api/agent/call-tool/route.js`, seguindo exatamente o padrão de
`web/app/carne-leao-automatico/route.js`:

```js
import { createAdminClient } from "@/lib/supabase/admin";

const TOOLS_VALIDAS = [
  "agent_listar_consultorios", "agent_buscar_paciente", "agent_get_agenda",
  "agent_status_pagamento_paciente", "agent_listar_debitos_paciente",
  "agent_registrar_pagamento_sessao", "agent_marcar_atendimento_realizado",
  "agent_agendar_sessao_avulsa", "agent_cancelar_sessao",
  "agent_gerar_recibo", "agent_listar_inadimplentes", "agent_resumo_financeiro",
  "agent_reagendar_sessao", "agent_excluir_sessao", "agent_excluir_pagamento",
  "agent_registrar_lancamento_despesa", "agent_registrar_anamnese",
  "agent_definir_consultorio_ativo",
];

export async function POST(request) {
  const segredo = request.headers.get("x-agent-secret");
  if (!segredo || segredo !== process.env.AGENT_TOOL_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { tool_name, whatsapp_number, params } = await request.json();

  if (!TOOLS_VALIDAS.includes(tool_name)) {
    return Response.json({ success: false, error_code: "TOOL_DESCONHECIDA" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(tool_name, {
    ...params,
    p_whatsapp_number: whatsapp_number,
  });

  await admin.from("agent_audit_log").insert({
    whatsapp_number,
    tool_name,
    parametros: params,
    resultado: error ? null : data,
    sucesso: !error,
    mensagem_erro: error?.message ?? null,
  });

  if (error) {
    return Response.json({ success: false, error_code: error.message }, { status: 200 });
  }

  return Response.json({ success: true, data });
}
```

(`error.message` de uma exceção `raise exception 'CODIGO' using errcode = 'P0001'`
chega no client como exatamente `"CODIGO"` — é assim que as 17 tools já
sinalizam erro de negócio, confirmado no comportamento das RPCs existentes.)

**Nova env var:** `AGENT_TOOL_SECRET` (mesmo padrão de `CARNE_LEAO_CRON_SECRET`
— gerada uma vez, configurada no EasyPanel do app principal e no nó HTTP
correspondente do n8n).

## Duas correções pequenas de SQL, descobertas nesta sessão

### 1. `_agent_resolve_consultorio` não lembra a escolha do profissional

Hoje, todo profissional com mais de um consultório seria interrompido pra
desambiguar **em toda mensagem** — a função nunca lê `agent_sessions`.
Corrigir (`create or replace`, mesma assinatura): antes de levantar
`CONSULTORIO_AMBIGUO`, checar se já existe `consultorio_ativo_id` salvo em
`agent_sessions` pra esse `whatsapp_number` e, se existir e ainda pertencer
ao mesmo profissional, usar ele.

Nova tool: `agent_definir_consultorio_ativo(p_whatsapp_number, p_consultorio_id) returns boolean`
— valida que o consultório pertence ao profissional, faz upsert em
`agent_sessions`. O protocolo completo (já desenhado no plano original):
tool falha com `CONSULTORIO_AMBIGUO` → agente chama
`agent_listar_consultorios` → pergunta ao usuário → chama
`agent_definir_consultorio_ativo` → tenta de novo a tool original (agora
sem precisar mais informar `p_consultorio_id`, fica salvo).

Se o profissional só tem um consultório, nada disso nunca aparece — é
puramente uma correção pra quem tem mais de um.

## Fluxo do workflow n8n

```
Evolution API (webhook MESSAGES_UPSERT)
  → "WA - Inbound Router"
      1. Ignora eventos que não são mensagem nova, e mensagens onde
         fromMe = true (o próprio bot, evita loop).
      2. Normaliza o número do remetente (Evolution API manda algo tipo
         "5511999999999@s.whatsapp.net" — extrair só os dígitos).
      3. Se a mensagem não for texto: responde "Por enquanto só consigo
         entender mensagens de texto 🙂" via "WA - Enviar Mensagem" e para.
      4. Consulta "Usuarios" (nó Supabase/Postgres do n8n, com a
         service_role key como credencial) por
         whatsapp_number = <número> and whatsapp_verified = true:
         - **Achou** → segue pro "WA - Agent Psicólogo".
         - **Não achou, mensagem parece um código de 6 dígitos** → chama a
           RPC já existente validar_codigo_whatsapp (via o mesmo proxy ou
           direto — RPC já pública/service_role) → responde com o texto de
           boas-vindas já redigido (docs/whatsapp-message-templates.md).
         - **Não achou, sem código** → responde apontando pra
           `/configuracoes/whatsapp` pra vincular o número.
  → "WA - Agent Psicólogo" (nó AI Agent nativo do n8n)
      - Chat Model: Google Gemini (gemini-3.5-flash-lite).
      - Memória: nó de memória do n8n (Postgres, já provisionado),
        chave = whatsapp_number — contexto de conversa persiste entre
        mensagens sem precisar de tabela nova no Supabase.
      - Tools: 18 nós HTTP Request Tool (as 17 já existentes + a nova
        `agent_definir_consultorio_ativo` desta entrega), cada um apontando pra
        `POST /api/agent/call-tool` com `tool_name` fixo e a descrição
        (pro Gemini) derivada do catálogo de erros/objetivo de cada tool
        já documentado na spec da metade 1.
      - System prompt (ver seção própria abaixo).
  → "WA - Enviar Mensagem" (sub-workflow reutilizável)
      - POST no endpoint de envio da Evolution API
        (`/message/sendText/{instance}`), usando `AUTHENTICATION_API_KEY`
        já configurada.
```

## System prompt — pontos obrigatórios

- Persona: secretário(a) de consultório de psicologia, tom profissional e
  cordial, respostas curtas (é WhatsApp, não e-mail) e sem markdown pesado.
- Nunca expor id interno de sessão/paciente/consultório na resposta —
  falar em nomes e datas, não em números de linha do banco.
- Protocolo explícito de `CONSULTORIO_AMBIGUO` (ver seção anterior) — o
  Gemini precisa saber que esse fluxo existe, não é algo automático só
  pelo schema das tools.
- **Confirmação antes de ação destrutiva:** antes de chamar
  `agent_excluir_sessao`, `agent_excluir_pagamento` ou
  `agent_cancelar_sessao`, o agente **repete o que vai fazer e pede
  confirmação explícita** ("Confirma que quer excluir o atendimento do dia
  X com o paciente Y?") antes de executar — não existe fluxo de aprovação
  formal como o canal do paciente teria, então essa confirmação em
  conversa é a única rede de segurança contra o Gemini agir sobre uma
  leitura errada da mensagem.
- Tradução de código de erro pra frase humana (mapear pelo menos os
  principais do catálogo da metade 1: `SESSAO_NAO_ENCONTRADA`,
  `SESSAO_NAO_REAGENDAVEL`, `SESSAO_TEM_VINCULO_FINANCEIRO`,
  `PAGAMENTO_TEM_NOTA_FISCAL`, etc.) — nunca mostrar o código cru pro
  profissional.

## O que fica fora desta entrega (sem mudança)

Canal do paciente, resumo diário proativo, lembretes automáticos,
relatórios, transcrição de áudio — todos fora de escopo, como já
combinado em 2026-08-17.

## Testes

Sem framework automatizado (convenção já estabelecida no projeto).
Verificação em camadas:

1. **Rota `/api/agent/call-tool`** isoladamente — testável como qualquer
   outra rota Next.js: chamar com um `tool_name` válido/inválido, com/sem
   segredo correto, conferir gravação em `agent_audit_log`.
2. **As 2 correções de SQL** — mesmo padrão de scripts contra produção com
   dados descartáveis já usado nas RPCs da metade 1: profissional de teste
   com 2 consultórios, confirmar que a 2ª mensagem não interrompe mais pra
   desambiguar depois de `agent_definir_consultorio_ativo` ser chamado.
3. **Workflow n8n ponta a ponta** — não dá pra scriptar; verificação manual
   mandando mensagens reais pro número vinculado, cobrindo pelo menos: uma
   consulta de leitura, uma ação de escrita com confirmação, o fluxo de
   vinculação por código, uma mensagem de áudio (confirma que recusa
   educadamente), e o protocolo de consultório ambíguo se houver
   profissional de teste com 2 consultórios.
