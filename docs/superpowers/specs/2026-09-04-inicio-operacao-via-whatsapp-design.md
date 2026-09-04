# Início de operação via WhatsApp — cadastro, onboarding e revalidação de segurança

Status: aprovado para plano de implementação
Data: 2026-09-04

Pedido do usuário: permitir que o psicólogo comece a usar o sistema
inteiramente pelo WhatsApp — cadastro de conta, cadastros básicos
(consultório, paciente, conta bancária) e operação do dia a dia — podendo
ir para o app quando quiser, sem que isso seja obrigatório. Com validação
de segurança periódica e consistente, e um onboarding "simpático" guiado
pelo chat.

Retoma e estende o agente de WhatsApp já em produção (canal do
profissional, 16 tools), documentado em
`docs/superpowers/specs/2026-08-17-agente-whatsapp-profissional-design.md`
e `docs/status-implementacao.md`.

## Objetivo

Hoje o agente de WhatsApp só opera para quem **já tem conta** criada pelo
app (`/cadastro`) e depois vincula o número em `/configuracoes/whatsapp`
com um código de 6 dígitos. Esta entrega permite que a conta **nasça** no
WhatsApp: alguém manda mensagem pro número do agente sem nunca ter usado o
app, cria a conta ali mesmo, faz os cadastros básicos guiado por conversa,
e só abre o app se e quando quiser.

## Escopo desta entrega

**Dentro:**
- Cadastro de conta nova 100% pelo WhatsApp (nome + e-mail, senha aleatória
  nunca exposta, confirmação por link mágico de e-mail).
- Diferenciação "já tenho conta" vs "conta nova" na primeira mensagem de
  número desconhecido (linguagem natural, sem menu numérico).
- Revalidação de segurança periódica: após 30 dias de inatividade no
  WhatsApp, a próxima mensagem exige reconfirmação por link mágico
  (fallback: código de 6 dígitos) antes de qualquer tool rodar.
- Onboarding guiado (consultório → paciente → conta bancária, cada etapa
  pulável) logo após a primeira confirmação de e-mail.
- 3 tools novas do agente: `agent_criar_consultorio`, `agent_criar_paciente`,
  `agent_criar_conta_bancaria`.
- Extensão de `agent_sessions` com estado de onboarding e das validações.
- Rota nova `/api/agent/onboarding` (Next.js) e workflow n8n novo
  `WA - Onboarding`.

**Fora (fica pra entrega futura, fora desta spec):**
- Canal do paciente (já era fora de escopo da entrega anterior).
- Qualquer mudança na tela `/configuracoes/whatsapp` ou no fluxo de
  vinculação por código já existente — continuam exatamente como estão,
  como caminho alternativo pra quem prefere começar pelo app.
- Mudar a validação da tela web de cadastro de consultório/paciente/conta
  (`criarConsultorio`/`criarPaciente`/`criarConta` em
  `web/lib/actions/`) — os campos relaxados descritos abaixo valem só
  para as tools novas do agente, não para o app.

## O que já existe (não faz parte desta entrega)

- Evolution API self-hosted, n8n self-hosted, `WA - Inbound Router` +
  `WA - Agent Psicólogo` + `WA - Enviar Mensagem` em produção, 16 tools do
  agente, `agent_sessions` (hoje só `consultorio_ativo_id` por
  `whatsapp_number`), `agent_audit_log`, RPCs
  `gerar_codigo_verificacao_whatsapp`/`validar_codigo_whatsapp`.
- Autocadastro web (`/cadastro`, `cadastrar()` em
  `web/lib/actions/auth.js`): `Usuarios.aprovado = false` por padrão pra
  quem se autocadastra, sem nenhum gate funcional — só um aviso no
  dashboard. Esta entrega usa a mesma semântica pra conta criada via
  WhatsApp.
- Convite de profissional (`convidarProfissional`,
  `web/lib/supabase/admin.js`) — único precedente de uso da Auth Admin API
  (`auth.admin.inviteUserByEmail`) a partir do Next.js com `service_role`;
  esta entrega usa o mesmo client, mas com `createUser` + `generateLink`.
- SMTP próprio via Resend já configurado no Supabase Auth, limite de envio
  em 30/hora.

## Decisões de identidade e segurança (confirmadas com o usuário)

- **Sem senha exposta**: conta criada via WhatsApp nasce com senha
  aleatória gerada no backend, nunca mostrada a ninguém. O psicólogo pode,
  se quiser, opcionalmente definir uma senha própria depois pelo app
  (fluxo já existente de redefinição de senha) — não é obrigatório, login
  no app continua possível via link mágico a qualquer momento.
- **Link mágico como mecanismo principal** de confirmação (cadastro novo,
  revalidação periódica). Código de 6 dígitos como fallback quando o
  psicólogo não conseguir clicar o link no momento (ex: e-mail aberto num
  dispositivo sem o app de e-mail configurado).
- **Janela de inatividade: 30 dias.** Enquanto o psicólogo conversa com
  regularidade, nunca é interrompido. Depois de 30 dias sem nenhuma
  mensagem, a próxima interação é bloqueada até revalidar.
- **Diferenciação "conta nova" vs "já tenho conta"**: primeira mensagem de
  número desconhecido recebe uma pergunta em linguagem natural
  interpretada pelo LLM, sem menu numérico fixo.

## Arquitetura

```
WhatsApp (número desconhecido, sem Usuarios.whatsapp_verified)
  → WA - Inbound Router (existente, estendido)
      - número não vinculado → encaminha pro WA - Onboarding (novo)
  → WA - Onboarding (novo)
      1. LLM pergunta: "já usa o sistema, ou é a primeira vez?"
      2a. Já tem conta → fluxo de vinculação já existente (código de 6
          dígitos gerado em /configuracoes/whatsapp) — sem mudança.
      2b. Conta nova → coleta nome + e-mail → POST /api/agent/onboarding
          (ação criar_conta) → Next.js cria Usuarios/Auth user (senha
          aleatória, aprovado=false) → gera link mágico
          (auth.admin.generateLink) → agente manda o link por e-mail e
          avisa no WhatsApp.
      3. Link clicado → /auth/callback (existente, estendido) → detecta
         agent_sessions.onboarding_etapa = 'aguardando_confirmacao_email'
         → chama webhook novo do n8n (N8N_ONBOARDING_CONTINUE_URL,
         autenticado por N8N_ONBOARDING_SECRET) com { whatsapp_number }.
      4. WA - Onboarding marca whatsapp_verified=true +
         ultima_validacao_seguranca_em=now(), onboarding_etapa='consultorio',
         e inicia a sequência guiada via WA - Enviar Mensagem (reaproveitado).
  → Depois de vinculado e validado: fluxo atual (WA - Agent Psicólogo, 16
    tools existentes + 3 novas).

Revalidação periódica (número já vinculado, mas
agent_sessions.ultima_validacao_seguranca_em > 30 dias):
  → WA - Inbound Router intercepta antes de rotear pro Agent Psicólogo,
    dispara o mesmo mecanismo de link mágico (ação revalidar em
    /api/agent/onboarding), bloqueia qualquer tool até confirmar.
  → Link clicado → mesmo webhook do passo 3 acima, mas como
    onboarding_etapa já é 'concluido', só atualiza
    ultima_validacao_seguranca_em e libera a conversa.
```

**Componentes novos:**
- Rota Next.js `POST /api/agent/onboarding` — único lugar que fala com a
  Auth Admin API pra esta entrega (criar usuário, gerar link mágico,
  reenviar).
- Workflow n8n `WA - Onboarding` — gatilho `Webhook` (diferente de
  `Execute Workflow Trigger`, porque é acionado de fora do n8n, pelo
  `/auth/callback`).
- 3 tools RPC (`agent_criar_consultorio`, `agent_criar_paciente`,
  `agent_criar_conta_bancaria`).
- 3 colunas novas em `agent_sessions`: `ultima_interacao_em`,
  `ultima_validacao_seguranca_em`, `onboarding_etapa`.
- Extensão pequena no `WA - Inbound Router` (checar janela de 30 dias
  antes de rotear) e no `/auth/callback` (detectar onboarding pendente e
  chamar o webhook novo).

## Fluxo de cadastro novo (detalhe)

1. Número desconhecido manda qualquer mensagem → Router encaminha pro
   `WA - Onboarding`, que responde perguntando se já usa o sistema.
2. Resposta interpretada como "conta nova" → agente pede nome e e-mail em
   linguagem natural (uma pergunta de cada vez, sem formulário rígido).
3. `POST /api/agent/onboarding` `{ acao: "criar_conta", whatsapp_number,
   nome, email }`:
   - Limite anti-abuso: no máx. 3 criações de conta por `whatsapp_number`
     em 24h (defesa contra spam/esgotar limite de e-mail do Resend) →
     `LIMITE_TENTATIVAS_CADASTRO`.
   - Se `email` já tem conta → **não cria duplicata**, responde
     `EMAIL_JA_CADASTRADO`; o agente troca de rumo: "esse e-mail já tem
     conta — vou te mandar um link pra confirmar que esse WhatsApp é seu"
     (cai no equivalente do fluxo de vinculação, usando o e-mail informado
     em vez do código de 6 dígitos).
   - Caso contrário: cria `Usuarios`/Auth user com senha aleatória,
     `aprovado = false`, `whatsapp_number` já preenchido (mas
     `whatsapp_verified = false` até o link ser clicado); cria linha em
     `agent_sessions` com `onboarding_etapa = 'aguardando_confirmacao_email'`;
     gera link mágico; retorna sucesso.
4. Agente manda mensagem no WhatsApp confirmando que o e-mail foi enviado.
   Se chegar mensagem nova antes do clique, o Router responde só o
   lembrete ("ainda não confirmei seu e-mail — clica no link, ou peço pra
   reenviar") sem rodar nenhuma tool.
5. Link expirado ou pedido explícito de reenvio → agente chama
   `/api/agent/onboarding` `{ acao: "reenviar_link", whatsapp_number }` —
   gera novo link, não cria segunda conta.
6. Link clicado → `/auth/callback` → webhook `WA - Onboarding` → boas-vindas
   + início do onboarding guiado (próxima seção).

## Onboarding guiado (detalhe)

Sequência linear, cada etapa registrada em `agent_sessions.onboarding_etapa`
pra resistir a abandono/retomada dias depois:

1. **Consultório** (única etapa obrigatória — nenhuma outra tool funciona
   sem consultório, pois todas resolvem `consultorio_id`). Pergunta só o
   nome; telefone/e-mail de atendimento herdam automaticamente do próprio
   `Usuarios` (WhatsApp e e-mail já coletados no cadastro) se não
   informados — evita perguntar de novo o que já se sabe. Corrigível
   depois pelo app.
2. **Primeiro paciente** — "quer cadastrar já um paciente, ou pula por
   agora?". Só `nome` obrigatório; telefone/e-mail/valor da sessão ficam
   `null` se omitidos, completáveis depois (por outra mensagem de
   WhatsApp ou pelo app).
3. **Conta bancária** — nome e banco obrigatórios (decisão do usuário,
   deliberadamente mais simples que a tela web); agência/número/tipo
   opcionais; `codigo` gerado automaticamente como próximo sequencial do
   profissional. Também pulável.
4. Mensagem final resumindo o que foi criado, avisando que os passos
   pulados podem ser feitos a qualquer momento (só pedir, ex: "cadastra
   paciente Maria") e que o app está disponível quando quiser.

Este relaxamento de campos obrigatórios (paciente sem telefone/e-mail,
conta com só nome+banco) vale **apenas para as 3 tools novas do agente** —
a tela web mantém a validação atual sem mudança.

## Tools novas

Todas seguem o padrão das 16 já existentes: `security definer`, primeiro
parâmetro `p_whatsapp_number text`, `revoke all` de
`public`/`anon`/`authenticated`, `grant execute` só pra `service_role`.
`owner` é sempre resolvido a partir do `whatsapp_number` verificado (ou,
durante o cadastro, do `Usuarios` recém-criado) — nunca recebido como
parâmetro do LLM.

### `agent_criar_consultorio`

`(p_whatsapp_number text, p_nome text, p_telefone text default null, p_email_atendimento text default null, p_endereco text default null) returns bigint`

Resolve owner via `whatsapp_number`; se `p_telefone`/`p_email_atendimento`
vierem nulos, usa `Usuarios.whatsapp_number`/`Usuarios.email` como
fallback. Insere `Consultorio` com `owner` setado manualmente (a RPC roda
como `service_role`, sem `auth.uid()` — o default de coluna do banco não
se aplica aqui). Retorna o id criado.

### `agent_criar_paciente`

`(p_whatsapp_number text, p_nome text, p_telefone text default null, p_email text default null, p_valor_sessao numeric default null, p_consultorio_id bigint default null) returns bigint`

Resolve consultório via `_agent_resolve_consultorio` (mesmo padrão das
tools existentes — levanta `CONSULTORIO_AMBIGUO`/`SEM_CONSULTORIO_CADASTRADO`
conforme já documentado). Insere `Paciente` com os campos opcionais como
`null` quando omitidos. Replica em PL/pgSQL a cascata da action web
(`criarPaciente`, `web/lib/actions/pacientes.js`): cria
`ResponsavelFinanceiro` próprio e o vínculo em
`PacienteResponsavelFinanceiro`. Retorna o id do paciente criado.

### `agent_criar_conta_bancaria`

`(p_whatsapp_number text, p_nome text, p_banco text, p_agencia text default null, p_numero text default null, p_tipo text default null) returns bigint`

Resolve owner via `whatsapp_number`. `codigo` gerado automaticamente como
o próximo sequencial das contas já existentes do profissional (formato
exato a confirmar contra `criarConta`, `web/lib/actions/contas.js`, na
hora de implementar — deve seguir a mesma convenção visual da tela, só
que preenchida automaticamente em vez de digitada). Insere
`ContaFinanceira` com `owner` setado manualmente. Retorna o id criado.

## Modelo de dados novo

### Colunas novas em `agent_sessions`

```sql
alter table agent_sessions
  add column ultima_interacao_em timestamptz,
  add column ultima_validacao_seguranca_em timestamptz,
  add column onboarding_etapa text;
```

- `ultima_interacao_em`: atualizada a cada mensagem processada com sucesso
  pelo `WA - Agent Psicólogo` (não durante onboarding/revalidação
  pendente).
- `ultima_validacao_seguranca_em`: setada no momento em que
  `whatsapp_verified` vira `true` (cadastro novo, vinculação por código,
  ou clique de link de revalidação). Base do cálculo da janela de 30 dias.
- `onboarding_etapa`: `null` (nunca iniciou/já concluído antes desta
  entrega existir) → `'aguardando_confirmacao_email'` →
  `'consultorio'` → `'paciente'` → `'conta'` → `'concluido'`.

## Erros e casos de borda

- **Consultório ambíguo / sem consultório**: mesmo comportamento já
  documentado nas 16 tools existentes — `agent_criar_paciente` também
  pode levantar `CONSULTORIO_AMBIGUO` se o profissional já tiver mais de
  um consultório (só possível depois do onboarding inicial, ex: chamando
  a tool de novo mais tarde).
- **E-mail já cadastrado no cadastro novo**: não cria duplicata, desvia
  pro fluxo de confirmação de posse do WhatsApp pra conta existente (ver
  Fluxo de cadastro, passo 3).
- **Link mágico expirado**: tratado como pedido de reenvio, não como erro
  fatal — não cria segunda conta.
- **Mensagem chega com onboarding/revalidação pendente**: nenhuma tool
  roda; resposta fixa lembrando de clicar o link (ou pedir reenvio).
  Aplica-se tanto ao cadastro novo quanto à revalidação periódica.
- **Abandono do onboarding guiado**: `onboarding_etapa` preserva o
  progresso; ao retomar (mesmo dias depois), o agente continua da etapa
  salva, sem repetir o que já foi feito.
- **Nunca clica o link (cadastro ou revalidação)**: conversa fica
  bloqueada pedindo a confirmação indefinidamente — mesmo comportamento
  já aceito hoje pro código de 6 dígitos expirado.
- **Limite de tentativas de cadastro**: 3 criações de conta por
  `whatsapp_number` em 24h; acima disso, `LIMITE_TENTATIVAS_CADASTRO`.

## Segurança

- Segredo compartilhado novo `N8N_ONBOARDING_SECRET`, mesmo padrão dos já
  existentes (`CARNE_LEAO_CRON_SECRET`, `BLOG_API_SECRET`,
  `AGENT_TOOL_SECRET`): precisa estar idêntico em 3 lugares
  (`web/.env.local`, EasyPanel produção, header do webhook no n8n).
  Divergência = falha silenciosa (o `/auth/callback` chama o webhook, leva
  403, e o onboarding nunca é retomado — usuário fica esperando sem saber
  por quê). Documentar isso explicitamente no plano de implementação como
  ponto de atenção, dado o histórico de bugs de segredo divergente já
  registrado neste projeto.
- Criação de usuário e geração de link mágico ficam centralizadas em
  `/api/agent/onboarding` (Next.js, usando o mesmo client `service_role`
  de `web/lib/supabase/admin.js`) — nunca no n8n, mesma razão já usada
  pra manter lógica sensível de Auth fora de um workflow (histórico de
  bugs de configuração no n8n documentado em
  `docs/status-implementacao.md`).
- As 3 tools novas seguem exatamente `revoke all ... from public, anon,
  authenticated` + `grant execute ... to service_role`.
- Anti-abuso de criação de conta (3/24h por número) protege o limite de
  envio de e-mail do Resend (30/hora) e evita contas-lixo.
- `owner` das 3 tools novas nunca é parâmetro do LLM — sempre resolvido
  a partir do `whatsapp_number` verificado ou do usuário recém-criado.

## Testes

Projeto não tem suíte automatizada — verificação manual por camada, mesmo
padrão já usado nas entregas anteriores:

1. **RPCs novas**: scripts diretos com dados descartáveis — criar
   consultório/paciente/conta de teste via `service_role`, conferir campos
   e a cascata de `ResponsavelFinanceiro`/`PacienteResponsavelFinanceiro`,
   limpar depois.
2. **Fluxo de cadastro ponta a ponta**: número de teste real → "primeira
   vez" → e-mail chega com link → clique confirma → onboarding guiado
   roda as 3 etapas (incluindo pular cada uma) → mensagem final. Repetir
   dizendo "já tenho conta" com e-mail já cadastrado, confirmar o desvio
   de fluxo (`EMAIL_JA_CADASTRADO`).
3. **Revalidação periódica**: forçar `ultima_validacao_seguranca_em` pra
   31 dias atrás num registro de teste, mandar mensagem, confirmar
   bloqueio; clicar o link; confirmar que libera de novo sem repetir o
   onboarding guiado.
4. **Limite anti-abuso**: 4 tentativas seguidas de criar conta pelo mesmo
   número, confirmar que a 4ª retorna `LIMITE_TENTATIVAS_CADASTRO`.
5. **`agent_audit_log`**: confirmar que as chamadas das 3 tools novas
   geram linha correspondente.

## Catálogo de códigos de erro (novos desta entrega)

| Código | Origem | Significado |
| --- | --- | --- |
| `EMAIL_JA_CADASTRADO` | `/api/agent/onboarding` (ação `criar_conta`) | E-mail informado já tem conta; fluxo desvia pra confirmação de posse em vez de criar duplicata. |
| `LIMITE_TENTATIVAS_CADASTRO` | `/api/agent/onboarding` (ação `criar_conta`) | Mais de 3 criações de conta pelo mesmo `whatsapp_number` em 24h. |
| `ONBOARDING_ETAPA_INVALIDA` | tools de onboarding | Tool chamada fora da sequência esperada (defesa em profundidade). |

Reaproveita, sem alteração, os códigos já existentes de
`CONSULTORIO_AMBIGUO`, `CONSULTORIO_INVALIDO`, `SEM_CONSULTORIO_CADASTRADO`
e `WHATSAPP_NAO_VINCULADO` (catálogo completo em
`docs/superpowers/specs/2026-08-17-agente-whatsapp-profissional-design.md`).
