# Agente comercial via WhatsApp + handoff (item 24, parte 4) — design

Status: aprovado para implementação
Data: 2026-09-12

Pedido do usuário: o CRM (partes 1-3, já prontas) passa a atender
possíveis clientes (psicólogos interessados em assinar) via agente de
WhatsApp, com handoff pro ADM quando o agente não resolver.

## Decisão já tomada com o usuário

Reaproveitar o **mesmo número/instância de WhatsApp** que já atende
profissional (gestão da própria agenda) — sem número novo, sem QR code
novo. O roteamento por número já existe: quem já tem conta cai no
agente de gestão, quem não tem cai no fluxo de onboarding. É esse
segundo fluxo que se torna o agente comercial.

**Risco assumido conscientemente**: o workflow que será editado ("WA -
Inbound Router") está em produção e atende profissionais reais agora.
A mudança fica isolada no ramo de número desconhecido — o ramo de
profissional já vinculado não é tocado.

## O que já existe (não faz parte desta entrega, só reaproveitado)

- `scripts/n8n-agente-whatsapp/04-workflow-inbound-router.mjs` — roteia
  por `Usuarios.whatsapp_number`. Número desconhecido, sem parecer
  código de 6 dígitos, cai direto em "WA - Onboarding" hoje.
- `scripts/n8n-agente-whatsapp/06-workflow-onboarding.mjs` — já é um
  agente Gemini (`AI Agent Cadastro`) com uma ferramenta
  (`agent_criar_conta`, chama `POST /api/agent/onboarding` com
  `acao: "criar_conta"`). Só sabe coletar nome/e-mail e criar conta —
  não responde dúvida sobre o produto.
- `web/app/api/agent/onboarding/route.js` — dispatch por `acao`
  (`criar_conta`, `reenviar_link`/`revalidar`), autenticado por
  segredo compartilhado (`AGENT_TOOL_SECRET`, header
  `x-agent-secret`). Ganha uma ação nova aqui.
- Tabelas `Lead`/`LeadNota` (item 24 parte 3, RLS admin-only).
- `web/lib/email/resend.js` (`enviarEmailResend`, `EMAIL_ADMIN`).
- `web/lib/planos.js` (`PLANOS`) — fonte dos preços que entram no
  prompt do agente.

## Schema (migration nova)

```sql
alter table "Lead" alter column nome drop not null;
-- nome só é conhecido depois que o agente pergunta; até lá o lead
-- de WhatsApp existe só com telefone.

alter table "Lead" add column aguardando_humano boolean not null default false;
-- true = bot pausado pra esse lead, só o ADM responde (pelo WhatsApp
-- normal, mesmo número) até desmarcar.

alter table "Lead" drop constraint "Lead_origem_check";
alter table "Lead" add constraint "Lead_origem_check"
  check (origem in ('cadastro', 'manual', 'whatsapp'));

create unique index lead_telefone_whatsapp_uidx on "Lead" (telefone)
  where origem = 'whatsapp';
-- escopado só a origem='whatsapp': não restringe telefone repetido em
-- leads manuais/de cadastro, só garante upsert idempotente pro fluxo
-- de inbound (um número = um lead, não duplica a cada mensagem).

alter table "LeadNota" add column autor text not null default 'admin'
  check (autor in ('admin', 'lead', 'agente'));
```

## Fluxo no Inbound Router (ramo "número desconhecido, não é código")

Hoje: bufferiza mensagem → debounce → chama "WA - Onboarding" → envia
resposta. Passa a ser, nessa ordem:

1. **Upsert do Lead** (Postgres node novo, `insert ... on conflict
   (telefone) where origem = 'whatsapp' do nothing`) — garante que o
   lead existe antes de qualquer outra coisa, sem duplicar em mensagens
   seguintes da mesma conversa.
2. **Checar `aguardando_humano`** (select). Se `true`: registra a
   mensagem como `LeadNota` (`autor: 'lead'`) e **para aqui** — não
   chama o agente, não manda resposta automática. O ADM vê a mensagem
   no CRM e responde pelo WhatsApp normal.
3. Se `false`: segue o fluxo de sempre (buffer/debounce já existentes,
   sem mudança), registrando a mensagem consumida do buffer como
   `LeadNota` (`autor: 'lead'`) antes de chamar "WA - Onboarding", e a
   resposta do agente como `LeadNota` (`autor: 'agente'`) depois,
   antes de enviar pelo WhatsApp.

Nenhum desses nós novos usa `onError: "continueRegularOutput"` — sempre
`continueErrorOutput` com a branch de erro genérica já existente no
workflow (mesmo padrão já estabelecido, ver comentários "Important #1"
no arquivo), pra um erro de log nunca silenciar um "usuário não
encontrado" nem travar a conversa.

## Prompt do agente ("WA - Onboarding") — expandido

O prompt atual (`SYSTEM_PROMPT_CADASTRO`) só sabe: perguntar se já tem
conta, orientar código de vinculação, ou colher nome+e-mail pra criar
conta. Adições:

- Contexto dos 4 planos (nome + preço + principais recursos, vindo de
  `PLANOS` — dados reais, não invenção) direto no texto do prompt
  (mesma técnica do prompt atual: string estática, sem tool de
  consulta — manutenção é editar o texto quando o preço mudar, aceito
  por ora).
- Autorização explícita pra responder dúvida sobre o produto (preço,
  como funciona, diferença entre planos) **antes** de pedir nome/e-mail
  — hoje o prompt já pressupõe que quem manda mensagem quer se
  cadastrar na hora; passa a permitir uma conversa de vendas real
  primeiro.
- Instrução de quando chamar a ferramenta nova `agent_escalar_para_humano`:
  quando a pessoa pedir pra falar com alguém, ou perguntar algo que o
  agente não tem certeza de responder (ex.: negociação de preço,
  reclamação, caso muito específico). Só chama, não inventa resposta.

## Ferramenta nova: `agent_escalar_para_humano`

Mesmo padrão de `agent_criar_conta` (nó `toolHttpRequest` no workflow
"WA - Onboarding", chama `POST /api/agent/onboarding`). Parâmetro:
`motivo` (texto curto, o que a pessoa perguntou/pediu).

`web/app/api/agent/onboarding/route.js` ganha `acao === "escalar"`:
1. Upsert do Lead por telefone (idempotente, mesma lógica do passo 1
   do router — protege contra a ferramenta ser chamada antes do lead
   existir por algum motivo).
2. `update "Lead" set aguardando_humano = true where telefone = $1`.
3. Insere `LeadNota` (`autor: 'agente'`, texto = motivo).
4. `enviarEmailResend` pro `EMAIL_ADMIN`: assunto "Lead precisa de você
   — {telefone}", corpo com o motivo e um link pro lead no CRM.

Sempre retorna `{ success: true }` pro agente (a mensagem de aviso pro
usuário — "vou chamar alguém pra te ajudar" — fica no próprio texto de
resposta do agente, não em outra chamada).

## CRM — retomar o bot

`web/app/(app)/admin/leads/[id]/page.js` ganha: indicador visual
quando `aguardando_humano = true`, e um botão "Devolver pro agente"
(nova server action `retomarAgenteLead(leadId)` em
`web/lib/actions/crm.js`, só `update "Lead" set aguardando_humano =
false`). Notas existentes ganham prefixo visual por `autor` (ex.:
"Lead", "Agente", você).

## Testes

Sem framework automatizado. Verificação por camadas:
1. Migration aplicada e confirmada (coluna, índice, constraint).
2. Rota `/api/agent/onboarding` com `acao: "escalar"` testada
   diretamente via curl (segredo certo), dado descartável — confirma
   Lead criado/atualizado, nota inserida, e-mail enviado (Resend
   retorna 200).
3. Scripts do n8n (`04`/`06`) reaplicados via `PUT` (idempotente, é o
   padrão já usado nesta pasta) — **contra produção, não existe
   staging**. Antes de aplicar, revisar o JSON gerado localmente
   (`node --check` nos arquivos, e imprimir o payload) pra pegar erro
   de sintaxe sem gastar uma chamada real à API do n8n.
4. Depois de aplicado: simular uma mensagem de número desconhecido via
   POST direto no webhook do Inbound Router (payload sintético
   `messages.upsert`, mesmo formato que a Evolution API manda, número
   de teste claramente falso pra não incomodar ninguém real) —
   confirma no banco que o Lead foi criado e a nota registrada. Repetir
   pedindo pra "falar com uma pessoa" — confirma `aguardando_humano`
   virou `true`, nota da IA registrada, e-mail chegou. Confirmar que
   uma segunda mensagem desse mesmo número de teste, depois da
   escalação, não dispara resposta automática (só nota).
5. Confirmar que o ramo de profissional já vinculado continua
   funcionando **sem nenhuma mudança** — reenviar o mesmo teste que já
   existia antes desta entrega (número de um profissional de teste já
   vinculado, pergunta simples tipo "quais atendimentos tenho hoje").
6. Todo dado de teste (Lead, LeadNota, execução do n8n) apagado/
   revisado ao final.
