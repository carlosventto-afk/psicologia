# Cobranças Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar sessões de um paciente numa Cobrança (valor fechado + tipo de documento), listar/detalhar cobranças no menu principal e na aba do paciente, e receber a cobrança inteira informando data, conta e forma de pagamento.

**Architecture:** Duas tabelas novas (`Cobranca`, `CobrancaSessao`) e três funções SQL transacionais (`criar_cobranca`, `receber_cobranca`, `cancelar_cobranca`) chamadas por server actions; triggers no banco bloqueiam por qualquer caminho (web e RPCs do agente de WhatsApp) receber, cancelar, excluir ou alterar o valor de uma sessão que está em cobrança aberta. "Cobrada" é derivado (vínculo ativo com cobrança aberta), nunca um novo `Sessao.status`. Lógica pura (elegibilidade, soma, mapeamentos) num helper testado com `node --test`.

**Tech Stack:** Next.js (App Router, server actions), Supabase Postgres (RLS por `owner uuid default auth.uid()`), Tailwind já usado no projeto.

**Spec:** `docs/superpowers/specs/2026-11-07-cobrancas-design.md`

## Global Constraints

- `Cobranca.tipo_documento` ∈ `nenhum` | `recibo` | `nota_fiscal`; `Cobranca.situacao` ∈ `aberta` | `recebida` | `cancelada`.
- Mapeamento `Paciente.documento` → tipo: `Nenhum`→`nenhum`, `Receita Saúde`→`recibo`, `Nota Fiscal`→`nota_fiscal` (confirmar os valores reais da coluna no código antes de usar).
- Valor congelado por sessão = `Sessao.valor − sum(RecebimentoSessao.valor_aplicado)` no momento da criação; `valor_total` = soma desses valores.
- Sessão elegível: `status` ≠ `Cancelada` (ou nulo), sem vínculo ativo, saldo > 0.
- `CobrancaSessao`: índice único parcial `(sessao) where ativa`; cancelar cobrança marca `ativa = false`.
- Receber exige data, conta e forma (`Dinheiro` | `Pix` | `Cartão`, valores da check de `Recebimento.forma_pagamento`); reusa o `responsavel_financeiro` gravado na cobrança.
- Tudo que escreve dinheiro roda numa função SQL (uma transação); bloqueios são no banco.
- Cobrança `recebida` não se cancela; se o `Recebimento` ligado for excluído, a cobrança volta a `aberta` com `recebimento` nulo.
- Texto e comentários em pt-BR; sem envio de mensagem ao paciente; sem emissão automática de documento.
- Menu "Cobranças" no grupo de gestão (plano `marketing` não vê, como as demais telas de `(gestao)`).
- Migration só é aplicada em produção com autorização do usuário; sem push/deploy no plano.

## Review Focus

- Dois cliques / duas abas em "Criar cobrança" para o mesmo paciente: a segunda não duplica nem trava as sessões (índice único parcial; mensagem amigável).
- Agente de WhatsApp registra pagamento (`agent_registrar_pagamento_sessao`) de sessão em cobrança aberta: bloqueado com mensagem que cita a cobrança, sem lançamento parcial gravado.
- Sessão da cobrança aberta é cancelada/excluída/tem valor alterado (web e RPCs do agente): bloqueado; depois de cancelar a cobrança, volta a poder.
- `receber_cobranca` falha no meio (conta de outro usuário, sessão que ganhou pagamento): nada fica gravado (sem lançamento órfão).
- Receber a mesma cobrança duas vezes (duplo clique): segundo recebimento é recusado.
- Excluir o `Recebimento` de uma cobrança recebida reabre a cobrança em vez de deixá-la "recebida" sem recebimento.
- Paciente sem sessões elegíveis / com responsável financeiro ausente: a tela explica em vez de quebrar.

---

### Task 1: Schema, funções SQL transacionais e helper puro

**Files:**
- Create: `supabase/migrations/20261107000001_add_cobrancas.sql`
- Create: `web/lib/cobranca.js`, `web/lib/cobranca.test.mjs`

**Interfaces:**
- Produces (SQL): tabelas `Cobranca(id, created_at, owner, paciente, responsavel_financeiro, periodo_referencia date null, valor_total numeric, tipo_documento, situacao, recebimento null, recebida_em null)` e `CobrancaSessao(id, cobranca, sessao, valor numeric, ativa bool default true, owner)`, RLS no padrão de `Recebimento`; funções `criar_cobranca(p_paciente bigint, p_sessoes bigint[], p_tipo_documento text, p_periodo date, p_responsavel bigint) returns bigint`, `receber_cobranca(p_cobranca bigint, p_data date, p_conta bigint, p_forma text) returns bigint` (retorna id do `Recebimento`), `cancelar_cobranca(p_cobranca bigint) returns void`. Todas `security invoker` (RLS vale), validam dono, situação e elegibilidade e levantam `raise exception` com mensagem em pt-BR.
- Produces (JS, `web/lib/cobranca.js`):
  - `saldoSessao(sessao: { valor, RecebimentoSessao?: {valor_aplicado}[] }): number`
  - `sessaoElegivel(sessao: { status, valor, RecebimentoSessao?, emCobrancaAtiva?: boolean }): boolean`
  - `totalCobranca(sessoes): number`
  - `tipoDocumentoDoPaciente(documento: string | null): "nenhum" | "recibo" | "nota_fiscal"`
  - `intervaloDoMes(ano: number, mes: number): { inicio: string, fim: string }` (strings `YYYY-MM-DD`, `fim` exclusivo).

- [ ] **Step 1:** Escrever os testes (`node:test`) de `web/lib/cobranca.js`: saldo com parcial (valor 150, aplicado 50 → 100), sessão Cancelada inelegível, saldo 0 inelegível, `emCobrancaAtiva` inelegível, `tipoDocumentoDoPaciente("Receita Saúde")==="recibo"`, `null`→`nenhum`, `intervaloDoMes(2026,2)` = `{inicio:"2026-02-01",fim:"2026-03-01"}` e dezembro cruzando o ano.
- [ ] **Step 2:** Rodar `cd web && node --test lib/cobranca.test.mjs` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `web/lib/cobranca.js` (ESM puro; `web/lib/package.json` já declara `type: module`).
- [ ] **Step 4:** Rodar o teste — Expected: PASS, saída sem avisos.
- [ ] **Step 5:** Escrever a migration (tabelas, RLS, índice único parcial, as 3 funções). `criar_cobranca` trava as linhas das sessões (`for update`), recalcula o saldo no servidor (nunca confia em valor do cliente) e rejeita se alguma sessão for inelegível ou de outro paciente/dono. `receber_cobranca` rejeita situação ≠ `aberta`, cria `LancamentoFinanceiro` (tipo `Receita`, mesmo padrão de `web/lib/recebimento.js`), `Recebimento`, `RecebimentoSessao` por sessão com o valor congelado (sinalizando ao trigger do Task 2 via `set_config('app.cobranca_recebendo', 'on', true)`), e marca a cobrança `recebida`.
- [ ] **Step 6:** Commit `feat: schema e funcoes de cobranca + helper puro` (migration **não** aplicada).

### Task 2: Bloqueios no banco

**Files:**
- Create: `supabase/migrations/20261107000002_cobranca_bloqueios.sql`

**Interfaces:**
- Consumes: tabelas e a sinalização `app.cobranca_recebendo` do Task 1; versão atual de `agent_registrar_pagamento_sessao` em `20260830000006` (só ler para entender que erro ele devolve).
- Produces: triggers que levantam exceção em pt-BR citando o id da cobrança:
  - `RecebimentoSessao` BEFORE INSERT: bloqueia se a sessão tem `CobrancaSessao` ativa de cobrança `aberta`, exceto quando `current_setting('app.cobranca_recebendo', true) = 'on'`;
  - `Sessao` BEFORE UPDATE (mudança de `valor` ou `status` → `Cancelada`) e BEFORE DELETE: bloqueia com a mesma condição;
  - `Recebimento` BEFORE DELETE: se existe `Cobranca.recebimento = old.id`, volta a cobrança para `aberta` e zera `recebimento`/`recebida_em`.

- [ ] **Step 1:** Escrever a migration com os 4 triggers/funções, preservando o comportamento atual quando não há cobrança.
- [ ] **Step 2:** Conferir lendo `20260830000006` e `web/lib/actions/recebimentos.js:136` (`excluirRecebimento`) que o bloqueio não depende de ordem de chamadas e que a exclusão de `Recebimento` ainda remove `RecebimentoSessao` antes (anotar no commit o que foi checado).
- [ ] **Step 3:** Commit `feat: bloqueios de cobranca no banco` (não aplicada).

### Task 3: Camada de dados e server actions

**Files:**
- Create: `web/lib/data/cobrancas.js`, `web/lib/actions/cobrancas.js`

**Interfaces:**
- Consumes: funções SQL do Task 1; `web/lib/cobranca.js`; padrão de `web/lib/data/recebimentos.js` e `web/lib/actions/recebimentos.js` (client `createClient()`, `normalizarIds`).
- Produces:
  - `listarCobrancas({ situacao?, pacienteId?, periodo? }): Promise<Cobranca[]>` (com nome do paciente e contagem de sessões)
  - `buscarCobranca(id): Promise<{ ...cobranca, paciente, sessoes: {id, data, horario, valor}[], recebimento? }>`
  - `listarSessoesElegiveis(pacienteId: number, intervalo?: { inicio: string, fim: string }): Promise<Sessao[]>`
  - `listarPacientesComPendencias(intervalo): Promise<{ paciente, qtdSessoes, total, tipoDocumentoPadrao }[]>`
  - Actions (`"use server"`): `criarCobranca(prevState, formData)` (campos `paciente`, repetido `sessao_id`, `tipo_documento`, `periodo?`, `responsavel_financeiro?`), `criarCobrancasDoMes(prevState, formData)` (uma cobrança por paciente marcado, cada um com seu tipo de documento), `receberCobranca(cobrancaId, prevState, formData)` (`data_recebimento`, `conta`, `forma_pagamento`), `cancelarCobranca(cobrancaId)`; todas devolvem `{ error }` com a mensagem do banco traduzida em caso de falha e chamam `revalidatePath` em `/cobrancas`, `/agenda`, `/financeiro` e `/pacientes/[id]`.

- [ ] **Step 1:** Implementar as funções de dados com filtros server-side; `listarSessoesElegiveis` usa `sessaoElegivel` e traz `RecebimentoSessao(valor_aplicado)` e o vínculo ativo.
- [ ] **Step 2:** Implementar as actions chamando `supabase.rpc(...)`; mapear erro único (duplo clique) para "Algumas dessas sessões já foram incluídas em outra cobrança."
- [ ] **Step 3:** Confirmar como o fluxo atual escolhe `responsavel_financeiro` em `registrarRecebimentoLote` (`web/lib/actions/recebimentos.js:45-98`) e reproduzir a mesma regra na criação (pergunta ao usuário só quando houver mais de um).
- [ ] **Step 4:** `cd web && npx next build --webpack` (a pasta `web/node_modules` pode ser junction no worktree) — Expected: sem erro.
- [ ] **Step 5:** Commit `feat: dados e acoes de cobranca`.

### Task 4: Tela "Cobranças" (lista + detalhe + receber) e menu

**Files:**
- Create: `web/app/(app)/(gestao)/cobrancas/page.js`, `web/app/(app)/(gestao)/cobrancas/[id]/page.js`, `web/components/ReceberCobrancaForm.js`
- Modify: `web/components/SidebarNav.js` (novo item "Cobranças" em `ITENS_NAV`, perto de "Financeiro")

**Interfaces:**
- Consumes: `listarCobrancas`, `buscarCobranca`, `receberCobranca`, `cancelarCobranca` (Task 3); lista de contas via `web/lib/data/contas.js` (mesma fonte do formulário `/pacientes/[id]/receber`).
- Produces: `ReceberCobrancaForm({ cobrancaId, contas }): JSX` (client; data padrão hoje, conta, forma) reutilizável pela aba do paciente (Task 6).

- [ ] **Step 1:** Lista: colunas paciente, período, valor, documento, situação, botão "Receber" nas abertas; filtros por situação e paciente; estado vazio explicativo.
- [ ] **Step 2:** Detalhe: sessões incluídas, tipo de documento, pagamento (data/conta/forma quando recebida), botões "Receber cobrança" (abre o form) e "Cancelar cobrança" (só aberta); em cobrança recebida com documento ≠ `nenhum`, link para `/recibos` ou `/notas-fiscais` conforme o tipo.
- [ ] **Step 3:** Adicionar o item no menu com o ícone existente mais próximo.
- [ ] **Step 4:** `cd web && npx next build --webpack` — Expected: sem erro.
- [ ] **Step 5:** Commit `feat: telas de cobrancas e item de menu`.

### Task 5: Tela "Nova cobrança" (rotina do mês)

**Files:**
- Create: `web/app/(app)/(gestao)/cobrancas/nova/page.js`, `web/components/NovaCobrancaMesForm.js`

**Interfaces:**
- Consumes: `listarPacientesComPendencias`, `criarCobrancasDoMes` (Task 3); `intervaloDoMes` (Task 1).
- Produces: página com seletor de mês (padrão: mês anterior), tabela por paciente (checkbox, nome, sessões, valor, select de tipo de documento pré-selecionado por `tipoDocumentoDoPaciente`), botão "Criar N cobranças"; link "Nova cobrança" na lista (Task 4) apontando para cá.

- [ ] **Step 1:** Implementar a página (server) e o formulário (client) com contador de selecionados e total; pacientes sem sessões elegíveis não aparecem.
- [ ] **Step 2:** Pacientes marcados mas com erro (ex.: sem responsável financeiro) devolvem lista de falhas por paciente sem derrubar as demais criações.
- [ ] **Step 3:** `cd web && npx next build --webpack` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: tela de nova cobranca do mes`.

### Task 6: Aba "Cobranças" no detalhe do paciente

**Files:**
- Modify: `web/app/(app)/(gestao)/pacientes/[id]/page.js` (constante `ABAS` e bloco `aba === "cobrancas"`)
- Create: `web/components/AgruparSessoesForm.js`

**Interfaces:**
- Consumes: `listarSessoesElegiveis`, `listarCobrancas({ pacienteId })`, `criarCobranca`, `ReceberCobrancaForm` (Tasks 3-4).
- Produces: aba `cobrancas` com (a) sessões sem cobrança do paciente (checkbox por sessão, soma dos marcados, tipo de documento pré-selecionado, botão "Agrupar em cobrança") e (b) cobranças do paciente com "Receber" nas abertas. Sessões em cobrança aberta exibem o selo "Cobrada" na aba "Sessões" existente (consultar vínculo ativo na query de sessões).

- [ ] **Step 1:** Adicionar a aba e o bloco, no mesmo estilo das abas existentes (`?aba=cobrancas`).
- [ ] **Step 2:** Selo "Cobrada" na lista de sessões da aba "Sessões".
- [ ] **Step 3:** `cd web && npx next build --webpack` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: aba de cobrancas no paciente`.

### Task 7: Mensagens nos fluxos existentes

**Files:**
- Modify: `web/lib/actions/recebimentos.js`, `web/lib/actions/sessoes.js`

**Interfaces:**
- Consumes: exceções dos triggers do Task 2 (texto cita a cobrança).
- Produces: as ações `registrarRecebimentoIndividual`, `registrarRecebimentoLote`, `usarCreditoNaSessao`, `cancelarSessao` e `atualizarSessao` devolvem o texto do bloqueio ao usuário (ex.: "Essa sessão está na cobrança #N. Receba pela cobrança.") em vez de "Não foi possível registrar o recebimento."; nenhum outro comportamento muda.

- [ ] **Step 1:** Nas ações acima, propagar a mensagem do banco quando for um bloqueio de cobrança (identificar por prefixo fixo definido no Task 2, ex.: `COBRANCA:`), mantendo a mensagem genérica para os demais erros.
- [ ] **Step 2:** `cd web && npx next build --webpack` — Expected: sem erro.
- [ ] **Step 3:** Commit `feat: mensagens de bloqueio de cobranca nos fluxos existentes`.

### Task 8: Verificação ponta a ponta e backlog

**Files:**
- Modify: `docs/backlog.md` (novo item 32, "Cobranças", em "Implementado" com data e o que foi/não foi verificado)

- [ ] **Step 1:** Com autorização do usuário, aplicar as duas migrations em produção (script `pg` já usado nos itens 22/aprovação; tentar direto e cair para o pooler; `notify pgrst, 'reload schema'`).
- [ ] **Step 2:** Com usuário e paciente descartáveis (apagados ao final), via SQL/RPC: criar cobrança (soma por saldo, sessão com parcial), duplo uso das mesmas sessões (recusa), receber (Recebimento + RecebimentoSessao + Lançamento coerentes), receber de novo (recusa), cancelar aberta (libera sessões), bloqueios (recebimento individual, cancelar/excluir/alterar valor de sessão, `agent_registrar_pagamento_sessao`), excluir o `Recebimento` de uma cobrança recebida (volta a `aberta`).
- [ ] **Step 3:** Build + preview local (`next build` padrão, nunca dev server) e exercitar as telas no navegador com os dados descartáveis; se o bug de cookie em Server Action já registrado reaparecer, registrar e cobrir pela camada de dados.
- [ ] **Step 4:** Atualizar `docs/backlog.md`, commit `docs: item 32 (cobrancas) implementado`.
- [ ] **Step 5:** Pedir ao usuário autorização para push e o token do EasyPanel para o deploy.
