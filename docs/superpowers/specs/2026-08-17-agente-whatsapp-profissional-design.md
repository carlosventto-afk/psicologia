# Agente de WhatsApp — secretário do profissional

Status: aprovado para plano de implementação
Data: 2026-08-17
Pedido do usuário, item 13 do backlog (`docs/backlog-novas-funcionalidades.md`).
Retoma um projeto já iniciado (Fase A) antes deste backlog numerado existir —
arquitetura completa original em
`C:\Users\Administrador\.claude\plans\preciso-criar-um-ecossistema-tidy-bachman.md`;
histórico do que já foi feito em `docs/status-implementacao.md`.

## Objetivo

O profissional fala com a ferramenta pelo próprio número de WhatsApp
(vinculado em `/configuracoes/whatsapp`) e consegue, por conversa: consultar
e alterar a agenda, criar/reagendar/excluir atendimento, registrar/excluir
pagamento, registrar lançamento de despesa, consultar financeiro e dados de
paciente, e registrar item de anamnese — sem abrir o app.

## Escopo desta entrega

**Dentro:** canal do profissional (secretário). Todas as tools abaixo.

**Fora (decisão do usuário em 2026-08-17):**
- Canal do paciente (consulta + solicitação de reagendamento/cancelamento
  sujeita a aprovação do psicólogo) — já desenhado na arquitetura original,
  fica pra uma entrega futura separada.
- Relatórios (resumo estendido em texto, ou geração/envio de arquivo) —
  adiado explicitamente.

## O que já existe (aplicado em produção, não faz parte desta entrega)

- **Canal:** Evolution API self-hosted (`evoapicloud/evolution-api:v2.3.7`),
  rodando no EasyPanel da mesma VPS, instância `psifacil` já pareada com um
  número dedicado. Decisão consciente de risco de banimento (viola Termos de
  Serviço do WhatsApp) — ver `docs/status-implementacao.md` pro incidente já
  registrado de queda/reconexão. Se o número cair, todo profissional fica
  sem o agente ao mesmo tempo.
- **Plataforma de orquestração:** n8n self-hosted já rodando na VPS
  (`psifacil_n8n` + `psifacil_n8n-db` + `psifacil_n8n-runner`, implantado
  originalmente pro item 9/Carnê-Leão). Falta só o workflow do agente em
  si, não a plataforma.
- **Vinculação:** tela `/configuracoes/whatsapp`
  (`VincularWhatsappForm.js`) + RPCs `gerar_codigo_verificacao_whatsapp`
  (chamada pelo Next.js) e `validar_codigo_whatsapp` (chamada pelo n8n) —
  código de 6 dígitos válido por 10 minutos, grava
  `Usuarios.whatsapp_number`/`whatsapp_verified`.
- **11 tools + 1 helper de negócio**, todas RPC `security definer`,
  executáveis só por `service_role` (migrations `20260727000002` +
  correção de casing em `20260727000005`):
  `agent_listar_consultorios`, `agent_buscar_paciente`, `agent_get_agenda`,
  `agent_status_pagamento_paciente`, `agent_listar_debitos_paciente`,
  `agent_registrar_pagamento_sessao`, `agent_marcar_atendimento_realizado`,
  `agent_agendar_sessao_avulsa`, `agent_cancelar_sessao`,
  `agent_gerar_recibo`, `agent_listar_inadimplentes`,
  `agent_resumo_financeiro`. Duas funções helper internas (prefixo `_agent_`,
  não expostas como tool): `_agent_get_owner_uuid(whatsapp_number)` resolve
  o profissional dono do número, `_agent_resolve_consultorio(whatsapp_number,
  consultorio_id?)` resolve/valida o consultório (levanta
  `CONSULTORIO_AMBIGUO` se o profissional tiver mais de um e nenhum foi
  informado — o n8n deve tratar chamando `agent_listar_consultorios` pra
  perguntar ao usuário).
- **`agent_sessions`** — não é histórico de conversa, é só o estado
  "consultório ativo" por número de WhatsApp (`whatsapp_number` PK,
  `usuario_id`, `consultorio_ativo_id`). Memória de conversa em si (o que
  foi dito nas últimas mensagens) é responsabilidade do workflow n8n, não
  do banco.
- **`agent_audit_log`** — log de toda chamada de tool (`tool_name`,
  `parametros`, `resultado`, `sucesso`, `mensagem_erro`, `criado_em`), hoje
  sem nenhum wrapper preenchendo (as tools não gravam nele sozinhas).
- **Convenção de valores confirmada em produção:** `Sessao.status` usa
  `'Marcada'`/`'Realizada'`/`'Cancelada'` (capitalizado — havia uma versão
  anterior em minúsculo, corrigida pela migration `20260727000005`, **as
  tools novas desta entrega devem usar a versão capitalizada**).
  `LancamentoFinanceiro.tipo` usa `'Receita'`/`'Despesa'`.

## Tools novas desta entrega

Todas seguem o padrão das 11 já existentes: `security definer`, primeiro
parâmetro `p_whatsapp_number text`, resolvem consultório via
`_agent_resolve_consultorio`, `revoke all` de `public`/`anon`/`authenticated`
e `grant execute` só pra `service_role`.

### 1. `agent_reagendar_sessao`

`(p_whatsapp_number text, p_sessao_id bigint, p_data_nova date, p_horario_novo time, p_consultorio_id bigint default null) returns jsonb`

1. Resolve consultório; valida que a sessão existe, pertence a um paciente
   desse consultório, e está **não realizada e não cancelada**
   (`"Realizado" = false and status is distinct from 'Cancelada'` — o `is
   distinct from` trata `status` nulo como reagendável também, mesmo padrão
   defensivo já usado no Painel pra dados legados sem status). Senão levanta
   `SESSAO_NAO_REAGENDAVEL`.
2. Guarda `data`/`horario` atuais da sessão.
3. `update "Sessao" set data = p_data_nova, horario = p_horario_novo where id = p_sessao_id` — não mexe em `status`/`Realizado`/`tipo_sessao`, só data/hora, e é a mesma linha (não cria nova, não cancela a atual).
4. Insere uma linha em `SessaoReagendamento` (ver modelo de dados abaixo) com
   os valores antigo/novo.
5. Conta quantos reagendamentos esse paciente teve no mês corrente
   (`reagendado_em` dentro do mês atual) e retorna
   `{ sessao_id, reagendamentos_mes_atual, alerta: reagendamentos_mes_atual >= 3 }`
   — o limiar de 3 fica hardcoded na função (sem UI de configuração nesta
   entrega); o n8n/LLM usa o campo `alerta` pra decidir se inclui um aviso
   na resposta ao profissional.

### 2. `agent_excluir_sessao`

`(p_whatsapp_number text, p_sessao_id bigint, p_consultorio_id bigint default null) returns boolean`

1. Resolve consultório, valida que a sessão pertence a um paciente desse
   consultório (senão levanta `SESSAO_NAO_ENCONTRADA`, mesmo código já
   usado por `agent_cancelar_sessao`/`agent_marcar_atendimento_realizado`).
2. `delete from "Sessao" where id = p_sessao_id`. As FKs de
   `PagamentoSessao.sessao`, `LancamentoFinanceiro.sessao` e
   `Recibo.sessao` são `on delete no action` (confirmado em produção via
   `information_schema` — Postgres já impede a exclusão sozinho se houver
   vínculo). A função captura a violação (`sqlstate '23503'`) e relança como
   `SESSAO_TEM_VINCULO_FINANCEIRO`, orientando o agente a sugerir cancelar
   em vez de excluir.
3. Sem vínculo, a exclusão é definitiva — diferente de
   `agent_cancelar_sessao`, que só muda `status`.

### 3. `agent_excluir_pagamento`

`(p_whatsapp_number text, p_pagamento_id bigint, p_consultorio_id bigint default null) returns boolean`

Espelha `excluirLancamento` (`web/lib/actions/lancamentos.js`): resolve
consultório, valida que o pagamento pertence a uma sessão de um paciente
desse consultório, apaga primeiro o próprio `PagamentoSessao` e só depois
o `LancamentoFinanceiro` vinculado (via `PagamentoSessao.lancamento`) —
nessa ordem porque `PagamentoSessao.lancamento` referencia
`LancamentoFinanceiro.id`, então apagar o lançamento primeiro levantaria
violação de FK. Isso "desfaz" o pagamento por completo — a sessão volta a
aparecer como não paga (o status pago é derivado só da existência de
`PagamentoSessao`, não muda `Sessao.status`/`Realizado` sozinho, mesmo
comportamento do app).

### 4. `agent_registrar_lancamento_despesa`

`(p_whatsapp_number text, p_descricao text, p_valor numeric, p_data date default current_date, p_conta_id bigint default null, p_consultorio_id bigint default null) returns bigint`

Espelha `criarLancamento` (`web/lib/actions/lancamentos.js`): resolve
consultório/owner, insere `LancamentoFinanceiro` com `tipo = 'Despesa'`,
sem `sessao` vinculada. Retorna o id do lançamento criado.

### 5. `agent_registrar_anamnese`

`(p_whatsapp_number text, p_paciente_id bigint, p_campos jsonb default '{}'::jsonb, p_observacao text default null, p_consultorio_id bigint default null) returns jsonb`

`p_campos` é um objeto com um subconjunto das 11 chaves válidas de
`web/lib/anamnese-campos.js` (ex: `{"queixa_inicial": "...", "medico_responsavel": "..."}`)
— o LLM decide, a partir da fala do profissional, quais campos preencher; a
função rejeita qualquer chave fora da lista de 11 (`CAMPO_ANAMNESE_INVALIDO`).

Reimplementa em PL/pgSQL a **mesma lógica de diff+upsert+followup** de
`salvarAnamnese` (`web/lib/actions/anamnese.js`), sem dynamic SQL — os 11
campos são comparados/atualizados explicitamente (não em loop genérico, pra
não precisar de `EXECUTE format(...)` acessando coluna por nome):

1. Resolve consultório; valida que o paciente pertence a esse consultório
   (senão levanta `PACIENTE_INVALIDO`, mesmo código já usado por
   `agent_agendar_sessao_avulsa`).
2. Busca a `Anamnese` atual do paciente (pode não existir).
3. Pra cada uma das 11 chaves: se `p_campos` trouxer essa chave e o valor
   for diferente do atual (ou o atual for nulo e a chave existir), entra em
   `alteracoes` com `valor_anterior`/`valor_novo` — mesma semântica do
   `calcularAlteracoes` do app (primeira gravação = `valor_anterior: null`
   pros campos preenchidos).
4. `upsert` na `Anamnese` (por `paciente`), cada coluna =
   `case when p_campos ? 'coluna' then nullif(trim(p_campos->>'coluna'), '')
   else valor_atual_da_coluna end` — só sobrescreve o que veio em
   `p_campos` (usando a checagem de existência de chave `?`, não
   `coalesce`, pra distinguir corretamente "chave ausente" de "chave
   presente como null"), mantém o resto. Valores string passam por
   `trim`/vazio-vira-`null` (mesma normalização de
   `web/lib/actions/anamnese.js`), pra edições só-com-espaço não gerarem
   diff espúrio e vazio funcionar como "limpar o campo".
5. Insere em `AnamneseFollowup` **se** `alteracoes` não for vazio **ou**
   `p_observacao` foi informado — mesma regra do app (sem followup se nada
   mudou e não veio observação).
6. Retorna `{ anamnese_id, alteracoes }`.

O histórico gerado por essa tool é indistinguível do gerado pela tela — mora
na mesma `AnamneseFollowup`, aparece na mesma timeline em
`/pacientes/[id]?aba=anamnese`.

## Modelo de dados novo

### `SessaoReagendamento`

```sql
create table "SessaoReagendamento" (
  id bigint generated by default as identity primary key,
  sessao bigint not null references "Sessao"(id) on delete cascade,
  paciente bigint not null references "Paciente"(id) on delete cascade,
  data_anterior date not null,
  horario_anterior time not null,
  data_nova date not null,
  horario_novo time not null,
  reagendado_em timestamptz not null default now()
);

create index sessaoreagendamento_paciente_idx on "SessaoReagendamento"(paciente, reagendado_em);
```

`paciente` denormalizado (em vez de só `sessao` + join) porque a query mais
frequente é "quantos reagendamentos esse paciente teve este mês", chamada a
cada `agent_reagendar_sessao`. RLS via join a `Paciente.owner`, mesmo padrão
em cadeia do item 12 (`AnamneseFollowup`) — mesmo só o `service_role`
escrevendo hoje, a tabela segue a mesma convenção de RLS de todo o resto do
projeto, e fica pronta se o app Next.js algum dia quiser expor esse
histórico numa tela.

## Fluxo do agente (arquitetura n8n)

```
WhatsApp (Evolution API)
  → webhook n8n: workflow "WA - Inbound Router"
      1. Se a mensagem for áudio: transcreve via Whisper antes de seguir.
      2. Resolve se o número está vinculado (whatsapp_verified) — se não,
         dispara o fluxo de vinculação existente (código de 6 dígitos).
      3. Se vinculado: encaminha pro workflow "WA - Agent Psicólogo".
  → "WA - Agent Psicólogo"
      1. Nó de IA (Claude) com tool-calling, tools = as 12 RPCs já
         existentes + as 5 novas desta entrega (16 no total), cada uma
         descrita com o schema de parâmetros pro LLM decidir quando/como
         chamar.
      2. Memória de conversa (curto prazo, últimas mensagens) fica dentro
         do próprio n8n (nó de memória por sessão, chave = whatsapp_number)
         — não depende de tabela nova, `agent_sessions` continua só como
         estado de "consultório ativo".
      3. Toda chamada de tool é uma chamada RPC ao Supabase com a
         `service_role` key (nunca `authenticated`).
      4. Cada chamada de tool é logada em `agent_audit_log`
         (`tool_name`, `parametros`, `resultado`, `sucesso`,
         `mensagem_erro`) — hoje nenhuma tool grava sozinha, o wrapper de
         log é responsabilidade do workflow n8n (chama a tool, loga o
         resultado, segue).
      5. O LLM formula a resposta final em texto a partir do(s) resultado(s)
         de tool, incluindo o alerta de reagendamento quando
         `agent_reagendar_sessao` retornar `alerta: true`.
  → resposta enviada de volta via Evolution API.
```

## Erros e casos de borda

- **Consultório ambíguo:** qualquer tool que não seja
  `agent_listar_consultorios` levanta `CONSULTORIO_AMBIGUO` se o
  profissional tiver mais de um consultório e nenhum foi especificado — o
  workflow deve capturar esse erro específico e perguntar ao usuário qual
  consultório antes de tentar de novo (comportamento já documentado nas
  tools existentes, as novas seguem o mesmo contrato).
- **Sessão não reagendável** (já realizada/cancelada): `agent_reagendar_sessao`
  recusa com erro específico, orientando a usar `agent_marcar_atendimento_realizado`
  ou informando que já foi cancelada.
- **Excluir sessão com vínculo financeiro:** erro específico orientando
  cancelar em vez de excluir (ver tool 2 acima).
- **Campo de anamnese inválido:** o LLM só deveria enviar as 11 chaves
  conhecidas (estarão no schema da tool), mas a função valida e rejeita
  qualquer coisa fora disso como defesa em profundidade.
- **Concorrência:** mesmo raciocínio do item 12 — não há edição colaborativa
  real (o profissional conversa sozinho com o agente), não é tratada
  explicitamente.

## Segurança

- Todas as tools novas seguem exatamente o padrão de `revoke all ... from
  public, anon, authenticated` + `grant execute ... to service_role` das 11
  já existentes — nunca chamáveis pela `anon`/`authenticated` key, só pelo
  n8n com a `service_role` key.
- Owner sempre resolvido a partir do `whatsapp_number` verificado
  (`_agent_get_owner_uuid`), nunca recebido como parâmetro direto do
  LLM/usuário — impede um profissional acessar dado de outro mesmo que o
  LLM alucine um id errado.
- `SessaoReagendamento` ganha RLS no mesmo padrão em cadeia já usado
  (`Paciente.owner`), mesmo sendo só o `service_role` a escrever hoje.

## Testes

Projeto não tem suíte automatizada. Verificação por camada, mesmo padrão já
usado nos itens anteriores:

1. **RPCs novas:** scripts diretos contra produção com dados descartáveis
   (paciente/sessão/pagamento de teste, sempre limpos ao final) — mesmo
   padrão dos itens 12/anamnese: criar cenário, chamar a função via
   `service_role`, conferir resultado, limpar. Cobrir especificamente: (a)
   `agent_reagendar_sessao` — reagendar 3x o mesmo paciente no mês e
   confirmar que a 3ª chamada retorna `alerta: true`; tentar reagendar uma
   sessão já `Realizada` e confirmar que falha; (b) `agent_excluir_sessao`
   — excluir sessão sem vínculo (sucesso) e com `PagamentoSessao` vinculado
   (falha com erro específico); (c) `agent_excluir_pagamento` — confirma
   que some o `PagamentoSessao` e o `LancamentoFinanceiro`, sessão volta a
   aparecer como não paga; (d) `agent_registrar_lancamento_despesa` —
   lançamento aparece em `/financeiro/lancamentos`; (e)
   `agent_registrar_anamnese` — os 4 cenários já cobertos no item 12
   (criação, edição parcial, no-op sem followup, observação isolada),
   agora chamando a RPC em vez da server action.
2. **Workflow n8n:** não dá pra testar via script — verificação manual,
   mandando mensagens reais pro número vinculado e conferindo a
   resposta/efeito no banco. Cobrir pelo menos uma chamada de cada uma das
   16 tools, mais o caso de consultório ambíguo (se o profissional de teste
   tiver mais de um) e uma mensagem de áudio (transcrição).
3. **`agent_audit_log`:** confirmar que cada interação de teste do item 2
   gerou uma linha correspondente.

## Catálogo de códigos de erro

Todo código é levantado com `raise exception '<CODIGO>' using errcode =
'P0001'` — o workflow n8n captura pela mensagem do erro (`<CODIGO>`), não
pelo `errcode` (todos usam o mesmo `P0001`). Cobre as 16 tools (11
pré-existentes + 5 desta entrega).

| Código | Função(ões) | Significado |
| --- | --- | --- |
| `WHATSAPP_NAO_VINCULADO` | `_agent_resolve_consultorio`/`_agent_get_owner_uuid` (todas as tools) | Número de WhatsApp não vinculado a nenhum profissional. |
| `CONSULTORIO_INVALIDO` | `_agent_resolve_consultorio` | `p_consultorio_id` informado não pertence ao profissional. |
| `CONSULTORIO_AMBIGUO` | `_agent_resolve_consultorio` | Profissional tem mais de um consultório e nenhum foi especificado. |
| `SEM_CONSULTORIO_CADASTRADO` | `_agent_resolve_consultorio` | Profissional não tem nenhum consultório cadastrado. |
| `SESSAO_NAO_ENCONTRADA` | `agent_cancelar_sessao`, `agent_marcar_atendimento_realizado`, `agent_excluir_sessao` | Sessão não existe ou não pertence ao consultório resolvido. |
| `PACIENTE_INVALIDO` | `agent_agendar_sessao_avulsa`, `agent_registrar_anamnese` | Paciente não existe ou não pertence ao consultório resolvido. |
| `SESSAO_NAO_REAGENDAVEL` | `agent_reagendar_sessao` | Sessão já realizada ou cancelada. |
| `SESSAO_TEM_VINCULO_FINANCEIRO` | `agent_excluir_sessao` | Sessão tem pagamento/lançamento/recibo vinculado, não pode ser excluída (só cancelada). |
| `PAGAMENTO_NAO_ENCONTRADO` | `agent_excluir_pagamento` | Pagamento não existe ou não pertence ao consultório resolvido. |
| `PAGAMENTO_TEM_NOTA_FISCAL` | `agent_excluir_pagamento` | Pagamento tem NFS-e vinculada, não pode ser excluído (adicionado na rodada de fix da revisão final, 2026-08-17). |
| `CONTA_INVALIDA` | `agent_registrar_lancamento_despesa` | Conta financeira informada não pertence ao profissional. |
| `CAMPO_ANAMNESE_INVALIDO` | `agent_registrar_anamnese` | Chave em `p_campos` fora da lista de 11 campos válidos. |
| `CAMPOS_INVALIDOS` | `agent_registrar_anamnese` | `p_campos` não é um objeto JSON (adicionado na rodada de fix da revisão final, 2026-08-17). |
