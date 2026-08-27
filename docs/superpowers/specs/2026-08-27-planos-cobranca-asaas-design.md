# Item 11 (metade 2) — Cobrança/gateway de pagamento dos planos

**Status:** aprovado, pronto para implementação.

## Objetivo

A metade 1 do item 11 (já implementada, migration `20260813000001_add_plano_usuarios.sql`)
criou `Usuarios.plano` (`'gestao' | 'gestao_marketing' | 'marketing'`) e o
gate de acesso em `(app)/(gestao)/layout.js`, mas sem nenhuma cobrança real
por trás — todo profissional está, na prática, de graça. Este item fecha o
ciclo: escolhe um gateway de pagamento, define preço de cada plano, integra
cobrança recorrente de verdade, e decide o que acontece em inadimplência e
troca de plano.

Durante o brainstorm, o escopo cresceu em duas direções que valem registrar
aqui como decisões, não como desvio:

1. Surgiu um **plano Grátis** novo (abaixo dos 3 planos pagos), pedido
   explícito do usuário — não estava no backlog original.
2. Descobrimos que o **agente de WhatsApp (item 13, já em produção)** escopa
   toda ação por "consultório ativo da conversa", o que colidiria com o
   limite de 1 consultório do plano Grátis. A correção decidida (parar de
   escopar por consultório, usar `owner` — a barreira de segurança real) é
   tratada como parte desta entrega porque o desenho do Grátis depende dela
   ficar resolvida primeiro.

## Não são objetivos desta entrega

- Suporte a mais de um método de recebimento simultâneo por cobrança (o
  Asaas decide isso no checkout — o profissional escolhe cartão/Pix/boleto
  na hora, não é algo que o app controla).
- Cobrança anual (só mensal nesta v1 — YAGNI; dá pra adicionar depois sem
  quebrar nada, é só um novo valor de `cycle` na chamada ao Asaas).
- Migração de usuários legados — não existe nenhum profissional cadastrado
  hoje, então todo cadastro novo já nasce no fluxo novo.
- Nota fiscal/recibo da própria mensalidade do PsiAgente pro profissional
  (é o Asaas quem emite o documento fiscal da cobrança, se aplicável).

## Gateway escolhido: Asaas

Comparado com Mercado Pago, Stripe e Pagar.me/Iugu durante o brainstorm.
Decisão: **Asaas**, por ser a opção mais barata pra cobrança recorrente de
ticket baixo em BRL (1,99% + R$0,49/cobrança no cartão, contra ~3-5% do
Mercado Pago e ~4,7% efetivo do Stripe), ter retentativa automática nativa
(5 tentativas — 3 no vencimento + 2 nos dias seguintes, o que cobre boa
parte do problema de inadimplência sem código nosso) e suporte nativo a Pix
Automático. Cadastro/documentação: <https://docs.asaas.com>.

**Modelo de integração**: checkout hospedado (não transparente/embedado) —
o app cria o cliente e a assinatura via API (`POST /v3/customers`,
`POST /v3/subscriptions`), recebe de volta uma URL de fatura/checkout e
redireciona o profissional pra lá. Ele escolhe cartão/Pix/boleto na própria
página do Asaas. Zero dado de cartão passa pelo nosso servidor — evita
qualquer escopo de PCI-DSS.

## Planos e preços

| Valor em `Usuarios.plano` | Nome comercial | Preço/mês | Consultórios | Recursos |
| --- | --- | --- | --- | --- |
| `gratis` | (sem nome comercial — plano de entrada) | R$ 0 | 1 (trava na criação de um 2º) | Agenda, Financeiro, Pacientes, Anamnese, Diretório. **Sem** agente de WhatsApp, **sem** emissão de documento (Recibo e NFS-e), **sem** Carnê-Leão |
| `gestao` | Psi Gestão | R$ 49,90 | Ilimitado | Tudo de gestão, sem diretório |
| `gestao_marketing` | Psi Gestão + Marketing | R$ 79,90 | Ilimitado | Tudo de gestão + diretório público |
| `marketing` | Psi Marketing | R$ 39,90 | — (não usa telas de gestão) | Só diretório público |

Preços definidos por benchmarking de concorrência (iClinic ~R$99/profissional,
recomendação de mercado de "até R$60 justo pra autônomo" para gestão;
Vittude ~R$80-140/mês e Doctoralia R$200-600/mês para presença em
marketplace, ambos com tráfego de paciente muito maior que o
`busca.psiagente.com.br` atual — daí o C mais barato que os dois).

## Modelo de dados

### `Usuarios` — colunas novas

```sql
alter table "Usuarios"
  add column plano_pago text check (plano_pago in ('gestao', 'gestao_marketing', 'marketing')),
  add column plano_pretendido text check (plano_pretendido in ('gratis', 'gestao', 'gestao_marketing', 'marketing')),
  add column plano_pretendido_a_partir_de timestamptz,
  add column assinatura_status text check (assinatura_status in ('ativa', 'inadimplente', 'cancelada')),
  add column asaas_customer_id text,
  add column asaas_subscription_id text,
  add column assinatura_vencida_em timestamptz;

alter table "Usuarios" drop constraint usuarios_plano_check;
alter table "Usuarios" add constraint usuarios_plano_check
  check (plano in ('gratis', 'gestao', 'gestao_marketing', 'marketing'));

alter table "Usuarios" alter column plano set default 'gratis';
```

- **`plano`** continua sendo o único campo que os gates de acesso olham —
  é o valor *efetivo*, agora podendo ser `'gratis'`. Todo cadastro novo já
  nasce com `plano = 'gratis'` (zero fricção — sem escolha obrigatória de
  cartão no onboarding).
- **`plano_pago`** é o que o profissional efetivamente contratou/paga —
  `null` enquanto ele está no Grátis por opção própria (nunca assinou nada).
  Continua populado mesmo se `plano` cair pra `'gratis'` por inadimplência
  — é o que a rotina de regularização usa pra saber pra onde voltar.
- **`plano_pretendido`** / **`plano_pretendido_a_partir_de`**: par de campos
  que representa "uma troca de plano agendada". Usado tanto em upgrade
  quanto em downgrade (ver "Fluxo de assinatura" abaixo) — o que muda entre
  os dois é só o valor de `plano_pretendido_a_partir_de` (`null`/imediato
  no upgrade, data de fim do ciclo pago no downgrade).
- **`assinatura_status`**: espelha o estado da cobrança no Asaas
  (`'ativa'` = última cobrança confirmada; `'inadimplente'` = cobrança
  vencida, dentro da carência; `'cancelada'` = assinatura cancelada no
  Asaas ou por decisão do profissional). `null` = nunca teve assinatura
  (sempre esteve no Grátis).
- **`assinatura_vencida_em`**: timestamp de quando a cobrança atual entrou
  em atraso — usado pra calcular quando a carência de 5 dias expira.

### Tabela nova: `EventoAssinatura`

Auditoria dos webhooks recebidos do Asaas — mesmo padrão já usado em
`EnvioAutomaticoCarneLeao` (item 9).

```sql
create table "EventoAssinatura" (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  usuario bigint references "Usuarios"(id),
  asaas_event_id text not null unique,
  tipo text not null,
  payload jsonb not null,
  processado_com_sucesso boolean not null default true,
  mensagem_erro text
);
```

`asaas_event_id unique` garante idempotência — o Asaas usa entrega "pelo
menos uma vez", então o mesmo evento pode chegar duplicado; um `insert`
que falha por conflito de unicidade é tratado como "já processado, ignora"
no handler do webhook.

RLS: sem policy de `select`/`insert` pra `authenticated` — só o
`service_role` (usado pelo webhook, que roda sem sessão de usuário) mexe
nessa tabela, mesmo padrão de `EnvioAutomaticoCarneLeao`.

## Fluxo de assinatura

### Nova página: `/assinatura`

Fica em `web/app/(app)/assinatura/page.js` — **fora** do grupo `(gestao)`,
no mesmo nível de `/diretorio`, porque precisa ser acessível mesmo por quem
está no plano `marketing` (que hoje é redirecionado pra fora de `(gestao)`
inteiro). Mostra o plano atual, os 4 cards de plano com preço, e:

Os dois fluxos abaixo usam o mesmo par `plano_pretendido` /
`plano_pretendido_a_partir_de` — a diferença é só quando o valor pendente
é aplicado.

- **Upgrade** (Grátis → qualquer pago, ou A/C → B, etc.): botão chama uma
  Server Action que cria o cliente no Asaas (se `asaas_customer_id` ainda
  não existir) e uma assinatura nova via `POST /v3/subscriptions`
  (`billingType: "UNDEFINED"` — deixa o profissional escolher o meio de
  pagamento no checkout), grava `asaas_subscription_id`,
  `plano_pretendido = <plano escolhido>` e `plano_pretendido_a_partir_de =
  null` (sem restrição de data — aplica assim que confirmar), e redireciona
  pra URL de checkout retornada. `plano`/`plano_pago` só mudam quando o
  webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` chegar (ver abaixo) — se o
  profissional abandonar o checkout sem pagar, nada muda e a assinatura
  fica pendente no Asaas até expirar por conta própria.
- **Downgrade pra outro plano pago** (ex.: B → A): a Server Action chama
  `PUT /v3/subscriptions/{id}` atualizando o `value` pro preço do novo
  plano — isso só afeta a **próxima** cobrança (a do ciclo já invoiced/pago
  continua no valor antigo, o Asaas não retroage). Grava
  `plano_pretendido = <novo plano>` e `plano_pretendido_a_partir_de =
  nextDueDate` (data da assinatura atual, i.e., quando o ciclo pago atual
  termina). Nada muda em `plano`/`plano_pago` até lá — a próxima cobrança
  automática do Asaas (já no valor novo) dispara o webhook de confirmação,
  que aplica a troca (ver abaixo). Não precisa de job separado: o próprio
  ciclo de cobrança do Asaas é o gatilho.
- **Downgrade pra Grátis**: cancela a assinatura no Asaas imediatamente
  (`DELETE /v3/subscriptions/{id}`) — não há próxima cobrança pra disparar
  webhook nenhum, então isso precisa do job diário (ver abaixo) pra
  efetivar a troca na data certa. Grava `plano_pretendido = 'gratis'` e
  `plano_pretendido_a_partir_de = nextDueDate` (fim do ciclo já pago).
  `plano`/`plano_pago` continuam no valor pago até essa data chegar.

Em qualquer um dos dois downgrades, a UI mostra: "Sua mudança pra {novo
plano} entra em vigor em {data}".

### Webhook: `POST /api/asaas/webhook`

Fora do grupo autenticado — adicionar à lista `PUBLIC_PATHS` de
`web/lib/supabase/proxy.js`, mesmo mecanismo já usado por
`/carne-leao-automatico`. Autenticado por header `asaas-access-token`
comparado a uma env var nova (`ASAAS_WEBHOOK_TOKEN`), configurada também no
cadastro do webhook no painel/API do Asaas.

Lógica, por tipo de evento (`event` no corpo do payload):

- **`PAYMENT_CONFIRMED`** ou **`PAYMENT_RECEIVED`**: busca o `Usuarios`
  pelo `asaas_subscription_id` do payload. Se `plano_pretendido` estiver
  setado **e** (`plano_pretendido_a_partir_de` for `null` **ou** já tiver
  passado), aplica esse valor em `plano_pago` e `plano`, e limpa os dois
  campos de pendência. Isso cobre upgrade (sem data, aplica na hora) e
  downgrade pra outro plano pago (a própria cobrança do ciclo seguinte só
  chega depois da data, então a condição já vem satisfeita). Se não há
  pendência, é só uma renovação normal ou uma reativação após
  inadimplência — não muda `plano_pago`, só sincroniza `plano = plano_pago`
  caso estivessem divergentes. Em qualquer um dos casos, seta
  `assinatura_status = 'ativa'` e limpa `assinatura_vencida_em`.
- **`PAYMENT_OVERDUE`**: seta `assinatura_status = 'inadimplente'` e
  `assinatura_vencida_em = now()` — **não** derruba `plano` na hora (o
  Asaas ainda vai tentar cobrar automaticamente por conta própria nos
  próximos dias).
- Qualquer outro evento: grava em `EventoAssinatura` só pra auditoria, sem
  ação.

Todo evento processado (com ação ou não) grava uma linha em
`EventoAssinatura` com o `payload` completo — histórico útil pra suporte
("por que esse profissional caiu pro Grátis?").

### Job diário: `POST /api/assinaturas/aplicar-pendencias`

Reaproveita a mesma infra de cron externo do item 9 (n8n na VPS chamando um
endpoint protegido por segredo compartilhado, `X-Cron-Secret` já usado por
`/carne-leao-automatico` — mesma env var ou uma nova dedicada, a decidir na
implementação). Roda 1x por dia e resolve as duas situações que **não** têm
nenhum webhook do Asaas pra disparar a mudança (porque não vai existir mais
nenhuma cobrança futura pra confirmar):

```
para cada Usuario com plano_pretendido = 'gratis'
                   e plano_pretendido_a_partir_de <= now():
  plano = 'gratis'
  limpa plano_pago, plano_pretendido, plano_pretendido_a_partir_de
  grava EventoAssinatura (tipo: 'downgrade_gratis_efetivado', sem payload do Asaas)

para cada Usuario com assinatura_status = 'inadimplente'
                   e now() - assinatura_vencida_em >= 5 dias:
  plano = 'gratis'
  assinatura_status permanece 'inadimplente' (só plano muda)
  grava EventoAssinatura (tipo: 'carencia_expirada', sem payload do Asaas)
```

No segundo caso, `plano_pago` **não muda** — fica registrado o que ele
deveria estar pagando, pra restaurar automaticamente quando o
`PAYMENT_CONFIRMED` chegar (ele pode regularizar a qualquer momento, mesmo
depois de já ter caído pro Grátis). Downgrades pra outro plano pago (B→A)
não passam por este job — são resolvidos pelo próprio webhook de
confirmação da cobrança seguinte, como descrito acima.

## Gates de acesso (app web)

`(app)/(gestao)/layout.js` continua redirecionando `plano === 'marketing'`
pra `/diretorio`, sem mudança. Novos gates, todos checando
`usuario.plano === 'gratis'`:

- `(gestao)/configuracoes/whatsapp`, `(gestao)/configuracoes/nfse`,
  `(gestao)/notas-fiscais`, `(gestao)/recibos`, `(gestao)/carne-leao`
  (página e rota `/carne-leao/gerar`): página mostra aviso "Disponível nos
  planos pagos" com link pra `/assinatura`, sem renderizar o conteúdo real.
- `(gestao)/consultorios/novo`: se `plano === 'gratis'` e o profissional já
  tem 1 consultório, bloqueia o submit (Server Action retorna erro) e a
  página mostra aviso + link pra `/assinatura`. **Não** mexe em
  consultórios já existentes — um profissional que tinha 2 e caiu pro
  Grátis continua enxergando e usando os 2 normalmente; só não consegue
  criar um 3º.
- `SidebarNav.js`: itens do grupo "Documentos" (Recibos/Notas
  Fiscais/Carnê-Leão) e "WhatsApp" ganham um indicador visual (ex.: um
  ícone de cadeado) quando `plano === 'gratis'`, mas continuam clicáveis —
  o aviso "de verdade" é a página de destino, a sidebar só sinaliza.

## Refatoração do agente de WhatsApp (item 13)

Necessária porque hoje toda RPC do agente escopa por
`consultorio = v_consultorio_id` (resolvido por `_agent_resolve_consultorio`,
que pode lançar `CONSULTORIO_AMBIGUO` se houver mais de um consultório sem
um "ativo" definido na conversa). Isso colide com o plano Grátis: um
profissional no Grátis com 1 consultório nunca teria ambiguidade, mas um
profissional pago com 2+ consultórios teria a experiência do agente
dependente de um conceito de "consultório ativo" que o resto do produto
não usa mais em lugar nenhum.

Descoberta que destrava a simplificação: `Paciente`, `Sessao`,
`LancamentoFinanceiro`, `Recibo` e `Consultorio` já têm coluna `owner`
própria (`auth.uid()`), que é a barreira de segurança real usada pelo RLS.
O filtro por `consultorio` nas RPCs do agente nunca foi segurança — era só
um recorte de UX pra conversa de WhatsApp.

**Mudança**: em `supabase/migrations/20260727000002_create_agent_rpc_functions.sql`
e nas migrations subsequentes que alteraram essas funções
(`20260727000005`, `20260817000003/06/07/08`, `20260819000001`), toda RPC
que hoje resolve `v_consultorio_id` via `_agent_resolve_consultorio` e
filtra por ele passa a filtrar só por `owner = v_owner` (owner já é
resolvido a partir do `whatsapp_number`, igual já acontece hoje). Uma
migration nova (`recreate`/`or replace` de cada função) aplica isso —
não precisa reescrever o histórico de migrations antigas.

Exceção: **`agent_gerar_recibo`** genuinamente precisa de um `consultorio`
específico pra gravar em `Recibo.consultorio` (not null). Passa a usar
`Paciente.consultorio` (já cadastrado no paciente) em vez de resolver um
"consultório ativo" — nenhuma pergunta nova ao usuário.

**Remoções** (ficam sem nenhum chamador depois da mudança acima):
- Função `_agent_resolve_consultorio` e a exceção `CONSULTORIO_AMBIGUO`.
- RPCs `agent_listar_consultorios` e `agent_definir_consultorio_ativo`.
- Coluna `agent_sessions.consultorio_ativo_id` (fica sem escrita nem
  leitura em lugar nenhum).

**n8n**: `scripts/n8n-agente-whatsapp/03-workflow-agent-psicologo.mjs`
(workflow `WA - Agent Psicólogo`) tem as definições de tool-calling e o
prompt do sistema — remover as 2 ferramentas descontinuadas e qualquer
menção a "perguntar qual consultório" no prompt, depois reimplantar via a
mesma API do n8n já usada na implantação original (documentada em
`docs/superpowers/plans/2026-08-19-agente-whatsapp-n8n-workflow.md`).

**Verificação**: não é possível testar com mensagem real de WhatsApp nesta
sessão (WhatsApp desconectado e créditos do Gemini esgotados — mesmo
bloqueio já registrado no item 13). Verificação equivalente à usada no
teste original do agente: chamar as RPCs diretamente via `service_role`
contra produção, com dado descartável, simulando um profissional com 2
consultórios e confirmando que `agent_get_agenda`/`agent_buscar_paciente`/
etc. retornam dados dos dois sem precisar de `p_consultorio_id`.

## Testes/verificação (item 11)

Sem framework de testes automatizados no projeto (convenção já registrada
em itens anteriores). Verificação prevista:

- **Direto via SQL/service-role contra produção**, com profissional de
  teste descartável: criar assinatura de teste no Asaas (ambiente sandbox,
  se disponível, ou uma cobrança real de baixo valor cancelada em seguida),
  disparar os webhooks manualmente (o Asaas permite reenviar/simular
  eventos) e conferir que `plano`/`plano_pago`/`assinatura_status` mudam
  como esperado.
- Simular o job de carência diretamente (chamar o endpoint com um usuário
  de teste com `assinatura_vencida_em` forçado pra 6 dias atrás).
- Playwright (GET-only, dado o bug de cookie já registrado em
  `psifacil-bug-cookie-server-action`) pra conferir que as páginas
  bloqueadas mostram o aviso certo pra um usuário Grátis.

## Riscos e decisões em aberto pra implementação

- **Ambiente sandbox do Asaas**: verificar se a conta usada tem acesso a
  sandbox antes de testar com dinheiro real — se não tiver, o teste vai
  precisar ser uma cobrança real de valor simbólico, cancelada depois.
- **Nome exato da env var do cron de carência**: reaproveitar
  `CARNE_LEAO_CRON_SECRET` ou criar uma nova — decisão de implementação,
  não muda o desenho.
- **Downgrade pra Grátis com consultórios extras**: comportamento definido
  (mantém tudo acessível) mas vale um aviso na UI de `/assinatura` deixando
  claro que os consultórios extras continuam existindo mesmo sem poder
  criar um novo.
