# Liberação temporária de plano (item 22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin libera um plano pago a um profissional por N dias; 3 dias antes do fim ele é avisado (e-mail + banner) e, no fim, a conta volta ao plano Grátis se não contratou plano pago.

**Architecture:** 3 colunas novas em `Usuarios` (`teste_plano`, `teste_expira_em`, `teste_aviso_enviado_em`), escritas só por `service_role`. Regras puras (elegibilidade, datas) num helper testável com `node --test`. Server actions de admin em `web/lib/actions/profissionais.js`. Expiração e aviso entram no job diário já agendado (`POST /api/assinaturas/aplicar-pendencias`, n8n, ativo em produção).

**Tech Stack:** Next.js (App Router, server actions), Supabase Postgres, Resend (`enviarEmailResend`), n8n (já agenda o job). Sem framework de testes no projeto: helper puro testado com `node --test` (nativo); o resto verificado ponta a ponta com dados descartáveis.

**Spec:** `docs/superpowers/specs/2026-11-05-liberacao-temporaria-plano-design.md`

## Global Constraints

- Planos liberáveis: `gestao`, `gestao_marketing`, `marketing` (nunca `gratis`).
- Elegível a receber teste: `plano = 'gratis'` e `plano_pretendido is null`.
- Duração padrão sugerida: 14 dias (escolhida pelo admin a cada liberação).
- Aviso: quando faltam ≤ 3 dias, uma vez por teste (`teste_aviso_enviado_em`); só marcar como enviado se o e-mail foi enviado.
- Fim do teste: `plano = 'gratis'` e limpar `teste_*`, **somente** se `plano_pago is null`.
- Nenhum GRANT novo para `authenticated`; só `service_role` escreve `teste_*`.
- Auditoria em `EventoAssinatura` (`asaas_event_id` único, `payload jsonb` obrigatório), tipos: `teste_liberado`, `teste_encerrado`, `teste_estendido`, `teste_expirado`, `teste_aviso_enviado`.
- Texto em pt-BR; e-mail para `Usuarios.email`; comentários do código em português como no resto do projeto.
- Não fazer push nem deploy; migration em produção só com autorização do usuário.

## Review Focus

- Profissional em teste escolhe, em `/assinatura`, o **mesmo plano** do teste: hoje `escolherPlano` devolve "Você já está nesse plano" e bloqueia a contratação. Esperado: checkout prossegue.
- Profissional em teste clica "Grátis" em `/assinatura`: hoje retornaria "Você já está no plano Grátis" (falso). Esperado: encerra o teste e volta ao Grátis.
- Admin atribui plano à mão (`SeletorPlano`) a alguém em teste: o job não pode rebaixar depois. Esperado: `teste_*` limpo.
- Teste expira enquanto há pagamento pendente: webhook posterior ainda promove ao plano contratado (não é rebaixado de novo, pois `plano_pago` passa a existir).
- Falha no Resend no dia do aviso: expiração não é impedida e o aviso é tentado de novo no dia seguinte.

---

### Task 1: Migration e leitura dos campos

**Files:**
- Create: `supabase/migrations/20261105000002_add_teste_plano_usuarios.sql`
- Modify: `web/lib/data/usuario.js` (select de `buscarUsuarioAtual`), `web/lib/data/profissionais.js` (select de `listarProfissionais`)

**Interfaces:**
- Produces: colunas `Usuarios.teste_plano text` (check nos 3 planos pagos), `teste_expira_em timestamptz`, `teste_aviso_enviado_em timestamptz`; os dois `select` passam a devolver esses 3 campos.

- [ ] **Step 1:** Escrever a migration (3 `add column`, check de `teste_plano`, check de consistência `(teste_plano is null) = (teste_expira_em is null)`), sem GRANT.
- [ ] **Step 2:** Incluir `teste_plano, teste_expira_em, teste_aviso_enviado_em` nos dois `select`.
- [ ] **Step 3:** Aplicar em produção **só após autorização do usuário**, com o mesmo script `pg` usado em `20261105000001` (tenta conexão direta e cai para o pooler), conferindo `information_schema.columns`.
- [ ] **Step 4:** `cd web && npx next build` — Expected: build sem erro.
- [ ] **Step 5:** Commit `feat: colunas de teste de plano em Usuarios`.

### Task 2: Helper puro de regras do teste

**Files:**
- Create: `web/lib/teste-plano.js`
- Test: `web/lib/teste-plano.test.mjs`

**Interfaces:**
- Produces:
  - `podeReceberTeste(usuario: { plano, plano_pretendido }): boolean`
  - `calcularFimTeste(agora: Date, dias: number, fimAtual?: Date | null): Date` — soma `dias` ao maior entre `agora` e `fimAtual`.
  - `diasRestantes(expiraEm: string | Date, agora: Date): number` — inteiro, arredondado para cima, mínimo 0.
  - `PLANOS_LIBERAVEIS: string[]` = `["gestao","gestao_marketing","marketing"]`
  - `DIAS_AVISO = 3`

- [ ] **Step 1:** Escrever os testes (`node:test`), com asserts em:
  `podeReceberTeste({plano:"gratis",plano_pretendido:null}) === true`; `{plano:"gestao",...}` → false; `{plano:"gratis",plano_pretendido:"gestao"}` → false;
  `calcularFimTeste(agora,14)` = agora+14d; com `fimAtual` futuro soma sobre ele; com `fimAtual` já passado soma sobre `agora`;
  `diasRestantes` com 2,5 dias → 3; já expirado → 0.
- [ ] **Step 2:** `cd web && node --test lib/teste-plano.test.mjs` — Expected: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar as funções acima em `web/lib/teste-plano.js` (ESM, sem dependências).
- [ ] **Step 4:** Rodar o teste — Expected: PASS. Se o Node não reconhecer o ESM em `.js`, renomear o import para o caminho completo e anotar no commit.
- [ ] **Step 5:** Commit `feat: regras puras do teste de plano`.

### Task 3: Server actions de admin e UI

**Files:**
- Modify: `web/lib/actions/profissionais.js` (reusa `exigirAdmin`, já existente no arquivo), `web/app/(app)/admin/profissionais/page.js`
- Create: `web/components/LiberarTesteForm.js` (client)

**Interfaces:**
- Consumes: `podeReceberTeste`, `calcularFimTeste`, `PLANOS_LIBERAVEIS` (Task 2); campos `teste_*` e `plano_pretendido` (Task 1).
- Produces:
  - `liberarTestePlano(id: number, plano: string, dias: number): Promise<void>`
  - `encerrarTestePlano(id: number): Promise<void>` (volta a `gratis`, limpa `teste_*`)
  - `estenderTestePlano(id: number, dias: number): Promise<void>` (soma ao fim atual; zera `teste_aviso_enviado_em`)
  - Todas validam admin, usam `createAdminClient()`, gravam `EventoAssinatura` com `asaas_event_id` único (ex.: `teste-liberado-${id}-${new Date().toISOString()}`), chamam `revalidatePath("/admin/profissionais")`, lançam `Error` com mensagem em pt-BR quando recusam (alvo não elegível, plano fora de `PLANOS_LIBERAVEIS`, `dias` fora de 1–90).
  - `alterarPlano` passa a também zerar `teste_plano/teste_expira_em/teste_aviso_enviado_em` (atribuição manual sobrepõe o teste).

- [ ] **Step 1:** Implementar as três actions e o ajuste em `alterarPlano`. `liberarTestePlano` busca o alvo com o admin client e chama `podeReceberTeste`; define `plano = plano liberado`, `teste_plano`, `teste_expira_em = calcularFimTeste(...)`, `teste_aviso_enviado_em = null`.
- [ ] **Step 2:** `LiberarTesteForm` (select de plano + input de dias com padrão 14 + botão "Liberar teste"), exibido na lista só quando `p.role !== "admin"` e elegível; quando `p.teste_expira_em` existe, mostrar "Em teste (Plano X) até DD/MM" com botões "Encerrar" e "Estender (+7 dias)".
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: liberar, encerrar e estender teste de plano pelo admin`.

### Task 4: Contratar durante o teste

**Files:**
- Modify: `web/app/api/asaas/webhook/route.js` (branch `pendenciaLiberada`, ~linha 54-60), `web/lib/actions/assinatura.js` (início de `escolherPlano`)

**Interfaces:**
- Consumes: campos `teste_*` (Task 1). Webhook já seleciona o usuário; incluir `teste_plano` não é necessário, só limpar.
- Produces: na confirmação de pagamento (qualquer ramo que ative plano pago), `atualizacao` ganha `teste_plano: null, teste_expira_em: null, teste_aviso_enviado_em: null`. Em `escolherPlano`: se `usuario.teste_plano` está definido, (a) `planoAlvo === usuario.plano` **não** retorna "já está nesse plano"; (b) `planoAlvo === "gratis"` encerra o teste (plano `gratis`, limpar `teste_*`, grava `EventoAssinatura` `teste_encerrado`) e retorna sucesso, em vez do erro "já está no Grátis". `buscarUsuarioAtual` já devolve `teste_plano` (Task 1).

- [ ] **Step 1:** Ajustar o webhook (limpar `teste_*` no ramo `pendenciaLiberada` e no ramo `else if (usuario.plano_pago)`).
- [ ] **Step 2:** Ajustar `escolherPlano` conforme acima, mantendo o resto do fluxo intacto.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: contratar plano durante o teste encerra o teste`.

### Task 5: Expiração e aviso no job diário

**Files:**
- Modify: `web/app/api/assinaturas/aplicar-pendencias/route.js`
- Create: `web/lib/email/aviso-teste-plano.js`

**Interfaces:**
- Consumes: `DIAS_AVISO`, `diasRestantes` (Task 2); `enviarEmailResend` (`web/lib/email/resend.js`, devolve resultado de sucesso/falha — ler o retorno antes de decidir marcar o aviso).
- Produces: `montarEmailAvisoTeste({ nome, planoNome, expiraEm, dias }): { subject: string, html: string }`; resposta JSON do job passa a incluir `testesExpirados: number` e `avisosTeste: number`.

Ordem no job: (1) expirar, (2) avisar, ambos **antes** dos passos existentes não importa; manter os atuais intactos.

- [ ] **Step 1:** Passo "expirar": selecionar `teste_expira_em <= agora` e `plano_pago is null`; para cada, `update` `plano = 'gratis'`, `teste_*` = null; gravar `EventoAssinatura` `teste_expirado` no mesmo padrão de tratamento de erro dos passos existentes (marcar `processado_com_sucesso=false` se o update falhar).
- [ ] **Step 2:** Passo "avisar": selecionar `teste_expira_em > agora`, `teste_expira_em <= agora + 3 dias`, `teste_aviso_enviado_em is null`; enviar e-mail; **só se enviou com sucesso** gravar `teste_aviso_enviado_em = agora` e `EventoAssinatura` `teste_aviso_enviado`. Falha de envio não interrompe o laço nem a expiração.
- [ ] **Step 3:** E-mail: avisa que o plano X termina em DD/MM, que a conta voltará ao plano Grátis e link para `/assinatura` para contratar (usar `NEXT_PUBLIC_SITE_URL` como nos outros e-mails).
- [ ] **Step 4:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 5:** Commit `feat: expiracao e aviso de teste de plano no job diario`.

### Task 6: Banner e página de assinatura

**Files:**
- Create: `web/components/BannerTestePlano.js`
- Modify: `web/app/(app)/layout.js`, `web/app/(app)/assinatura/page.js`

**Interfaces:**
- Consumes: `diasRestantes` (Task 2), `PLANOS` (`web/lib/planos.js`), campos `teste_*` de `buscarUsuarioAtual`.
- Produces: `BannerTestePlano({ plano, expiraEm }): JSX | null` — "Você está testando o plano X; termina em N dia(s), depois volta ao plano Grátis. Contratar" (link `/assinatura`); aparece sempre que `teste_expira_em` está definido (destaque de cor quando `diasRestantes <= 3`). Em `/assinatura`, mesma informação no topo, ao lado dos avisos já existentes.

- [ ] **Step 1:** Criar o componente (server component) e usá-lo no layout logo abaixo do aviso de aprovação pendente.
- [ ] **Step 2:** Mostrar o aviso também em `/assinatura`.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: banner de teste de plano`.

### Task 7: Verificação ponta a ponta e backlog

**Files:**
- Modify: `docs/backlog.md` (mover item 22 para "Implementado" com data)

- [ ] **Step 1:** Com usuário descartável (criado e apagado ao final), `service_role`/SQL contra produção após migration: liberar teste → `plano` muda; rodar o job com `x-cron-secret` local (build + preview, nunca dev server) com `teste_expira_em` forçado para daqui 2 dias → e-mail enviado e `teste_aviso_enviado_em` preenchido; rodar de novo → não reenvia; forçar `teste_expira_em` no passado → volta a `gratis` e limpa `teste_*`; usuário com `plano_pago` preenchido e teste vencido → **não** rebaixado.
- [ ] **Step 2:** Verificar `alterarPlano` limpando `teste_*` e a recusa de liberar para quem tem `plano != 'gratis'` (chamar as actions via preview autenticado ou testar a lógica por SQL, anotando qual foi usado; se o bug de cookie em Server Action registrado reaparecer, registrar e cobrir pela camada de dados).
- [ ] **Step 3:** Atualizar `docs/backlog.md` (item 22 implementado, com observações do que foi/não foi verificado na UI).
- [ ] **Step 4:** Commit `docs: item 22 implementado`.
- [ ] **Step 5:** Pedir ao usuário autorização para push e deploy (token do EasyPanel).
