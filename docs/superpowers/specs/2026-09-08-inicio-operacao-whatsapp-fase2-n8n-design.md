# Início de operação via WhatsApp — Fase 2 (workflow n8n)

Status: aprovado para plano de implementação
Data: 2026-09-08

Pedido do usuário: construir o workflow n8n que efetivamente liga o
backend da Fase 1 (já em produção — ver
`docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md`
e `docs/superpowers/plans/2026-09-04-inicio-operacao-whatsapp-backend.md`)
ao WhatsApp de verdade: cadastro de conta nova por conversa, onboarding
guiado conduzido pelo agente já existente, e a checagem de revalidação de
30 dias.

## O que já existe (Fase 1, não faz parte desta entrega)

- Rota `POST /api/agent/onboarding` (`criar_conta`/`reenviar_link`/`revalidar`),
  autenticada por `AGENT_TOOL_SECRET` (mesmo segredo de `/api/agent/call-tool`).
- 3 RPCs de criação (`agent_criar_consultorio`, `agent_criar_paciente`,
  `agent_criar_conta_bancaria`), isentas de checagem de plano enquanto
  `agent_sessions.onboarding_etapa <> 'concluido'`.
- 6 colunas em `agent_sessions`, com `check` restringindo `onboarding_etapa`
  a `null`/`'aguardando_confirmacao_email'`/`'consultorio'`/`'paciente'`/
  `'conta'`/`'concluido'`.
- `/auth/callback`/`/auth/confirm` chamando `continuarFluxoWhatsapp` —
  avisa `N8N_ONBOARDING_CONTINUE_URL` (header `x-onboarding-secret` =
  `N8N_ONBOARDING_SECRET`) quando há confirmação pendente. **Nenhuma das
  duas env vars existe em ambiente nenhum ainda** — só passam a existir
  quando este plano configurar o webhook do `WA - Onboarding`.
- 3 workflows n8n já em produção: `WA - Enviar Mensagem`
  (`zzOUzuQ8kbEtkMyy`), `WA - Inbound Router` (`5muCm5Q2UYo2jWWe`),
  `WA - Agent Psicólogo` (`2DCUpWdgU1A2PyFv`) — 16 tools, todas ativas.
- Credenciais n8n já existentes: `postgres`, `gemini`, `proxySecret`
  (header `x-agent-secret` = `AGENT_TOOL_SECRET`), `evolutionApiKey`,
  `webhookSecret` (autentica o webhook de entrada do Router).
- **Estado real da infra confirmado em 2026-09-08**: n8n (v2.21.0) e
  Evolution API rodando saudáveis, WhatsApp conectado (`state: open`).
  **A produção do app Next.js não foi redeployada desde 2026-09-02** —
  o código da Fase 1 existe só no repositório, não está rodando ainda.
  O SMTP do Supabase Auth (usado pra mandar o link mágico) estava
  retornando `500` consistentemente na última checagem — credenciais e
  config confirmadas corretas, causa raiz aponta pra instabilidade da
  própria plataforma Supabase (status page mostrando degradação
  parcial), sem solução do nosso lado. Ver seção "Sequenciamento".

## Escopo desta entrega

**Dentro:**
- Addendum pequeno à Fase 1: RPC nova `agent_avancar_onboarding` +
  migration (fecha uma lacuna real: nada hoje avança
  `agent_sessions.onboarding_etapa` de uma etapa pra próxima).
- Extensão do `WA - Inbound Router`: diferenciação "já tenho conta"/
  "conta nova" por linguagem natural (substitui o texto fixo atual pro
  ramo de número desconhecido que não bate o regex de código de 6
  dígitos) + checagem da janela de 30 dias de inatividade antes de
  rotear pro Agent Psicólogo.
- Workflow novo `WA - Onboarding`, com dois gatilhos independentes no
  mesmo arquivo: `Execute Workflow Trigger` (chamado pelo Router pra
  conversa de cadastro) e `Webhook` (chamado por `/auth/callback` quando
  o link mágico é clicado).
- Extensão do `WA - Agent Psicólogo`: 4 tools novas (as 3 de criação da
  Fase 1 + `agent_avancar_onboarding`) e lógica condicional no system
  prompt pra conduzir o onboarding guiado quando `onboarding_etapa`
  ainda não é `'concluido'`, sem virar um "modo" separado do agente.

**Fora:**
- Qualquer mudança no backend Next.js/RPCs já entregues na Fase 1, além
  do addendum de `agent_avancar_onboarding` explicitamente descrito aqui.
- Canal do paciente, relatórios — já fora de escopo desde o design
  original do agente (2026-08-17).

## Addendum à Fase 1: RPC `agent_avancar_onboarding`

**Lacuna encontrada durante o planejamento desta fase**: nenhuma das 3
RPCs de criação da Fase 1 avança `agent_sessions.onboarding_etapa`, e não
existe nenhum jeito de "pular" uma etapa sem criar o registro
correspondente. Sem isso, o profissional fica preso na mesma etapa pra
sempre depois de criar o primeiro consultório.

```sql
create or replace function public.agent_avancar_onboarding(
  p_whatsapp_number text,
  p_etapa_atual text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa_real text;
  v_proxima text;
begin
  select onboarding_etapa into v_etapa_real
  from agent_sessions
  where whatsapp_number = p_whatsapp_number;

  if v_etapa_real is null or v_etapa_real <> p_etapa_atual then
    raise exception 'ONBOARDING_ETAPA_INVALIDA' using errcode = 'P0001';
  end if;

  v_proxima := case v_etapa_real
    when 'consultorio' then 'paciente'
    when 'paciente' then 'conta'
    when 'conta' then 'concluido'
    else 'concluido'
  end;

  update agent_sessions set onboarding_etapa = v_proxima
  where whatsapp_number = p_whatsapp_number;

  return v_proxima;
end;
$$;

revoke all on function public.agent_avancar_onboarding(text, text) from public, anon, authenticated;
grant execute on function public.agent_avancar_onboarding(text, text) to service_role;
```

- **Consome `ONBOARDING_ETAPA_INVALIDA`**, código já catalogado na spec
  da Fase 1 como "não implementado, YAGNI" — deixa de ser YAGNI aqui:
  esta é a primeira RPC que pode ser chamada fora de ordem de verdade
  (o LLM pode alucinar/repetir a chamada), então a defesa em profundidade
  passa a valer a pena.
- **Contrato com o agente**: o LLM chama essa tool **sempre** depois de
  terminar OU pular uma etapa — nunca decide sozinho avançar o estado por
  conta própria alterando `agent_sessions` diretamente (não tem como,
  RLS bloqueia; só essa RPC pode escrever a coluna).
- Isenta de checagem de plano no `/api/agent/call-tool` do mesmo jeito
  que as 3 RPCs de criação (adicionar à lista `TOOLS_ONBOARDING`).

## Extensão do `WA - Inbound Router`

### 1. Diferenciação "já tenho conta" vs "conta nova"

Hoje, o ramo `Usuário encontrado? → Não` → `Parece código de 6 dígitos? → Não`
responde só um texto fixo instruindo a usar o app. Esse ramo passa a
chamar `WA - Onboarding` via `Execute Workflow Trigger`, passando
`{whatsapp_number, mensagem_texto}` — mesmo padrão de chamada já usado
pra `WA - Agent Psicólogo`. O ramo do regex de 6 dígitos (`Parece código
de 6 dígitos? → Sim`) continua exatamente como está, sem mudança —
alguém que já tem conta e está digitando o código nunca passa pelo
`WA - Onboarding`.

### 2. Janela de revalidação de 30 dias

`Buscar Usuario Vinculado` (query Postgres já existente) passa a
selecionar também `agent_sessions.ultima_validacao_seguranca_em` e
`agent_sessions.link_confirmacao_pendente` (via `left join` em
`agent_sessions` por `whatsapp_number` — a query hoje já faz esse join
implicitamente através de `Usuarios.whatsapp_number`/`whatsapp_verified`,
só precisa trazer as colunas novas). Novo nó de decisão logo depois:

- Se `link_confirmacao_pendente = true` → responde o lembrete fixo
  ("ainda não confirmei seu e-mail..."), não roda nenhuma tool.
- Senão, se `now() - ultima_validacao_seguranca_em > 30 dias` → chama
  `POST /api/agent/onboarding` (`{acao: "revalidar", whatsapp_number}`)
  via HTTP node (credencial `proxySecret`), responde pedindo pra
  clicar o link, não roda nenhuma tool.
- Senão → segue pro fluxo normal (buffer → `WA - Agent Psicólogo`),
  como hoje — só que agora passando `onboarding_etapa` no input também.

## `WA - Onboarding` — workflow novo, dois gatilhos

### Gatilho 1: `Execute Workflow Trigger` (conversa de cadastro)

Recebe `{whatsapp_number, mensagem_texto}`. AI Agent (mesmo modelo
Gemini dos outros workflows), com **1 tool só**:
`toolHttpRequest` → `POST /api/agent/onboarding`
(`{acao: "criar_conta", whatsapp_number, nome, email}`, credencial
`proxySecret`, mesmo padrão de string/placeholder já documentado nos
comentários de `03-workflow-agent-psicologo.mjs`).

System prompt cobre: perguntar se já tem conta ou é a primeira vez
(linguagem natural, sem menu); se "já tenho conta", orientar mandar o
código de 6 dígitos (sem chamar tool nenhuma — a mensagem seguinte com o
código já é tratada pelo Router); se "conta nova", coletar nome e e-mail
(uma pergunta de cada vez) e chamar a tool; traduzir
`WHATSAPP_JA_CADASTRADO`/`EMAIL_JA_CADASTRADO`/`LIMITE_TENTATIVAS_CADASTRO`/
`ERRO_ENVIAR_LINK` pra frases humanas. Devolve `{output}`, mandado via
`WA - Enviar Mensagem` pelo Router (mesmo padrão do Agent Psicólogo).

### Gatilho 2: `Webhook` (clique do link mágico)

Path aleatório, autenticado por `headerAuth` com a credencial nova
`onboardingWebhookSecret` (header `x-onboarding-secret`) — mesmo padrão
do `webhookSecret` do Router. Recebe `{whatsapp_number}` do
`/auth/callback`. Fluxo (nó Postgres, mesma credencial `postgres` já
usada pelo Router):

1. `update "Usuarios" set whatsapp_verified = true where whatsapp_number = $1`
2. `update agent_sessions set ultima_validacao_seguranca_em = now(), link_confirmacao_pendente = false, onboarding_etapa = case when onboarding_etapa = 'aguardando_confirmacao_email' then 'consultorio' else onboarding_etapa end where whatsapp_number = $1 returning onboarding_etapa`
3. Se o `onboarding_etapa` retornado for `'consultorio'` (era cadastro
   novo) → manda a primeira mensagem da sequência guiada ("conta
   confirmada! vamos configurar seu primeiro consultório — qual o
   nome?") via `WA - Enviar Mensagem`.
4. Senão (já era `'concluido'`, era revalidação) → manda "confirmado,
   pode continuar" via `WA - Enviar Mensagem`.

## Extensão do `WA - Agent Psicólogo`

- **4 tools novas** (nós `toolHttpRequest` idênticos em estrutura aos 16
  já existentes, credencial `proxySecret`): `agent_criar_consultorio`,
  `agent_criar_paciente`, `agent_criar_conta_bancaria`,
  `agent_avancar_onboarding`.
- **Input do workflow ganha `onboarding_etapa`** (trazido pelo Router
  desde a extensão da seção anterior), junto de `whatsapp_number`/
  `mensagem_texto`/`usuario_nome` já existentes.
- **Seção nova no system prompt**, condicional:
  - `onboarding_etapa` nulo ou `'concluido'` → comportamento idêntico ao
    de hoje, sem menção a onboarding.
  - `onboarding_etapa` em `'consultorio'`/`'paciente'`/`'conta'` →
    instrui o agente a priorizar guiar a etapa atual (perguntar o que
    falta, oferecer pular), mas sem bloquear outras perguntas — se o
    profissional perguntar outra coisa, responde normalmente com as
    outras 16 tools e só retoma o onboarding na resposta seguinte.
    Fluxo por etapa: cria (`agent_criar_X`) ou pula → sempre chama
    `agent_avancar_onboarding(etapa_atual)` em seguida, nos dois casos.
    Quando `agent_avancar_onboarding` retornar `'concluido'`, manda a
    mensagem final de resumo (já redigida na spec da Fase 1).
- **Tradução de erro** ganha: `SEM_CONSULTORIO_CADASTRADO`,
  `CONSULTORIO_INVALIDO`, `NOME_OBRIGATORIO`, `BANCO_OBRIGATORIO`,
  `ONBOARDING_ETAPA_INVALIDA`.

## Segurança

- Credencial n8n nova: `onboardingWebhookSecret` (header
  `x-onboarding-secret`, valor = `N8N_ONBOARDING_SECRET`) — precisa
  ficar idêntica nos 2 lugares (EasyPanel do app + esta credencial),
  mesmo risco de falha silenciosa já documentado na spec da Fase 1 pros
  outros segredos compartilhados deste projeto.
- Nenhuma credencial nova além dessa — as 4 tools novas e a tool do
  mini-agente reaproveitam `proxySecret` (`AGENT_TOOL_SECRET`).
- `whatsapp_number` que chega no `WA - Onboarding` (gatilho 1) é sempre
  `numero_normalizado`, extraído pelo nó "Normalizar Payload" do Router
  a partir do JID da Evolution API — nunca preenchido pelo LLM em
  nenhum dos dois workflows, mesmo contrato já documentado no comentário
  de `web/app/api/agent/onboarding/route.js`.
- `TOOLS_ONBOARDING` (Fase 1) ganha `agent_avancar_onboarding` — isenta
  de checagem de plano no `/api/agent/call-tool` pelo mesmo motivo das
  3 RPCs de criação (ainda faz parte do onboarding, ainda não devia
  exigir plano pago).

## Sequenciamento

1. **Migration do addendum** (`agent_avancar_onboarding`) — aplicável
   agora, não depende de nada externo.
2. **Construir e ativar os 3 workflows/extensões** via scripts `.mjs`
   (mesmo padrão de `scripts/n8n-agente-whatsapp/`) — não depende de
   deploy nem do SMTP, só da API do n8n (já confirmada acessível).
3. **Bloqueado até resolver**: teste real de ponta a ponta (criar conta
   → e-mail chega → clica → onboarding guiado roda) precisa de dois
   itens que não são deste plano: (a) deploy manual do app no EasyPanel
   (produção não tem o código da Fase 1 ainda), (b) SMTP do Supabase
   Auth voltando a funcionar (instabilidade da plataforma deles, sem
   solução do nosso lado — ver seção "O que já existe"). Os workflows
   ficam construídos e ativados, mas o teste de fechamento (Task final
   do plano de implementação) só roda quando os dois itens acima
   estiverem resolvidos — o plano vai marcar isso explicitamente como
   um passo que pode ficar pendente entre sessões.

## Testes

Mesmo padrão de verificação manual já usado no resto do projeto (sem
suíte automatizada):

1. `agent_avancar_onboarding`: script direto — chamar fora de ordem
   (`p_etapa_atual` errado) confirma `ONBOARDING_ETAPA_INVALIDA`; chamar
   em sequência confirma a progressão `consultorio → paciente → conta →
   concluido`.
2. Workflows: verificação manual mandando mensagens reais (bloqueada até
   o sequenciamento acima resolver) — cobrir número desconhecido dizendo
   "primeira vez", número desconhecido dizendo "já tenho conta" (deve
   cair no fluxo de código de 6 dígitos, sem tocar o `WA - Onboarding`),
   clique do link, as 3 etapas do onboarding guiado (criando e pulando),
   e revalidação (forçar `ultima_validacao_seguranca_em` pra 31 dias
   atrás num registro de teste).
3. `agent_audit_log`: confirmar linha pra cada chamada das 4 tools
   novas durante o teste manual.
