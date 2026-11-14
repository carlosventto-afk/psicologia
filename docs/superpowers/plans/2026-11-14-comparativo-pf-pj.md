# Comparativo PF x PJ (`/comparativo`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública `psiagente.com.br/comparativo` que compara imposto/líquido de Carnê-Leão (PF) x Simples Nacional (PJ), libera o resultado após nome+WhatsApp+e-mail, grava um Lead e oferece CTAs (WhatsApp do especialista, cadastro).

**Architecture:** Cálculo puro e testável em `web/lib/comparativo/` (parâmetros 2026 isolados num arquivo). Uma Server Action pública grava o Lead (service-role) e notifica o ADM. A página é uma rota Next.js no domínio principal (App Router), com um componente client de 3 passos.

**Tech Stack:** Next.js 16 (ler `web/node_modules/next/dist/docs/` antes de codar — API diferente do que se conhece), React 19, Supabase (service-role), Resend, `node --test` (`.test.mjs`, padrão de `web/lib/teste-plano.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-14-comparativo-pf-pj-design.md`

## Global Constraints

- URL é `/comparativo` no domínio principal; **não** criar subdomínio.
- Resultado só renderiza depois de nome, WhatsApp e e-mail válidos.
- Despesas: aluguel do consultório; supervisão e formação; contas do consultório (luz, internet, telefone); material e software; Outros (anuidade do CRP, marketing).
- Contador PJ: padrão R$ 300/mês, editável.
- Lead: `origem = 'comparativo'`, `estagio = 'novo'`, `visitante_sessao_id` do cookie `pv_id`; insert via `createAdminClient()` (RLS do CRM é admin-only); falha de gravação nunca impede mostrar o resultado.
- WhatsApp do especialista: `NUMERO_GESTOR` de `web/lib/whatsapp.js` (`5591981910295`); cadastro: `/cadastro?origem=comparativo`.
- Parâmetros 2026 (valores verificados na web, conferir na fonte oficial): teto INSS R$ 8.475,55; salário mínimo R$ 1.621,00; redutor Lei 15.270: base ≤ R$ 5.000 → imposto zero; R$ 5.000,01–7.350 → redução = 978,62 − 0,133145 × base; > 7.350 sem redutor; PF autônomo INSS 20% (plano normal); PJ pró-labore 28% do faturamento (mín. 1 salário mínimo), INSS 11% até o teto; Simples Anexo III.
- Aviso obrigatório no resultado: "Simulação estimada, não substitui orientação contábil."
- Commits convencionais, um por tarefa, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Sem push.

## Review Focus

- Faturamento zero, negativo ou vazio → erro de validação, nunca `NaN` na tela (Task 2, 4).
- Despesas maiores que o faturamento → base zero, imposto zero, sem valor negativo (Task 1).
- Faturamento exatamente R$ 5.000 e R$ 7.350 (bordas do redutor) e faturamento anual > R$ 4,8 mi (fora do Simples) (Task 1, 2).
- Pró-labore de 28% abaixo do salário mínimo (faturamentos baixos) → usa o mínimo (Task 2).
- Telefone/e-mail inválidos e duplo clique no envio → rejeita; Lead não duplica (Task 3).
- Faturamento muito alto: dividendos acima do limite da Lei 15.270 → aviso em vez de número (Task 2).

---

### Task 1: Parâmetros 2026 e cálculo da PF (Carnê-Leão)

**Files:**
- Create: `web/lib/comparativo/parametros-2026.js`
- Create: `web/lib/comparativo/pessoa-fisica.js`
- Test: `web/lib/comparativo/pessoa-fisica.test.mjs`

**Interfaces:**
- Produces: `PARAMETROS` (objeto com `salarioMinimo`, `tetoInss`, `faixasIrpf` (limite, aliquota, deducao), `redutor` ({ isencaoAte, fimRedutor, constante, fator }), `anexoIII` (faixas de RBT12 com aliquota e parcela a deduzir), `limiteSimplesAnual`, `proLaborePercentual`, `aliquotaInssAutonomo`, `aliquotaInssProLabore`, `contadorPadrao`); cada grupo com comentário de fonte e vigência.
- Produces: `irpfMensal({ base: number, rendimentoTributavel: number }): number` — imposto da tabela progressiva menos o redutor, nunca negativo; redutor avaliado sobre `rendimentoTributavel`.
- Produces: `calcularPessoaFisica({ faturamento: number, despesas: number }): { inss: number, base: number, irpf: number, imposto: number, liquido: number }` — base = faturamento − despesas − INSS; `imposto = inss + irpf`; `liquido = faturamento − despesas − imposto`.

- [ ] **Step 1: Buscar na fonte oficial (Receita Federal) a tabela mensal do IRPF vigente em 2026 e a regra do redutor (se o limite de R$ 5.000 é sobre rendimento bruto ou base líquida)**

Preencher `parametros-2026.js` com esses valores e a URL da fonte em comentário. Se a fonte não for conclusiva, usar a leitura conservadora (redutor sobre o rendimento bruto = faturamento) e registrar a hipótese no comentário.

- [ ] **Step 2: Write the failing tests**

Casos em `pessoa-fisica.test.mjs` (valores esperados calculados à mão a partir dos parâmetros, não copiados da implementação):
`irpfMensal` zera para rendimento ≤ 5.000; aplica `978,62 − 0,133145 × rendimento` entre 5.000,01 e 7.350 (ex.: 6.000 → redução 179,75); sem redutor em 7.350,01; nunca negativo. `calcularPessoaFisica`: despesas > faturamento → base 0, imposto = inss sobre… (definir: INSS sobre faturamento − despesas, mínimo 0), `liquido` nunca `NaN`; INSS limitado ao teto para faturamento alto; INSS mínimo no piso do salário mínimo quando houver faturamento > 0.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && node --test lib/comparativo/pessoa-fisica.test.mjs`
Expected: FAIL (módulos não existem).

- [ ] **Step 4: Implement `parametros-2026.js` and `pessoa-fisica.js`** per Interfaces; arredondar a centavos só na saída.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && node --test lib/comparativo/pessoa-fisica.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/comparativo
git commit -m "feat: parametros 2026 e calculo da pessoa fisica do comparativo"
```

### Task 2: Cálculo da PJ (Simples Nacional) e comparação

**Files:**
- Create: `web/lib/comparativo/pessoa-juridica.js`
- Create: `web/lib/comparativo/comparar.js`
- Test: `web/lib/comparativo/pessoa-juridica.test.mjs`, `web/lib/comparativo/comparar.test.mjs`

**Interfaces:**
- Consumes: `PARAMETROS`, `irpfMensal` (Task 1).
- Produces: `calcularPessoaJuridica({ faturamento, despesas, contador }): { proLabore, inssProLabore, irrfProLabore, simples, contador, imposto, liquido, avisoDividendos: boolean }` — `imposto = simples + inssProLabore + irrfProLabore`; `liquido = faturamento − despesas − imposto − contador`. Alíquota efetiva do Simples: `(RBT12 × aliq − PD) / RBT12` com RBT12 = faturamento × 12 (Anexo III). Lança `RangeError` se RBT12 > `limiteSimplesAnual`.
- Produces: `compararCenarios(entrada: { faturamento, despesasPorCategoria: { aluguel, supervisao, contas, material, outros }, contador? }): { ok: true, pf, pj, melhor: "pf"|"pj"|"empate", economiaMensal: number, economiaAnual: number } | { ok: false, erro: string }` — soma as despesas; valida faturamento > 0 e valores numéricos não negativos; captura o `RangeError` como `{ ok: false, erro }`; `contador` ausente usa `PARAMETROS.contadorPadrao`.

- [ ] **Step 1: Write the failing tests**

`pessoa-juridica.test.mjs`: pró-labore = 28% do faturamento; abaixo do salário mínimo usa o mínimo; INSS 11% limitado ao teto; alíquota efetiva da faixa 1 (RBT12 ≤ 180.000) é 6%; faixa 2 usa a fórmula com parcela a deduzir (conferir um ponto à mão); RBT12 > 4,8 mi lança `RangeError`; `avisoDividendos` verdadeiro para faturamento muito alto. `comparar.test.mjs`: faturamento 0/negativo/`NaN`/vazio → `ok:false`; despesa negativa → `ok:false`; contador omitido usa 300; `melhor` e `economiaMensal`/`economiaAnual` (= mensal × 12) coerentes com `pf.liquido` e `pj.liquido`; faturamento fora do Simples → `ok:false` com mensagem.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/comparativo/`
Expected: FAIL.

- [ ] **Step 3: Implement `calcularPessoaJuridica` and `compararCenarios`** per Interfaces. Anexo III: usar a tabela de faixas de `PARAMETROS` (conferir na LC 123/2006, Anexo III, e registrar a fonte).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/comparativo/`
Expected: PASS (todas as suítes, incluindo a da Task 1).

- [ ] **Step 5: Commit**

```bash
git add web/lib/comparativo
git commit -m "feat: calculo da pessoa juridica e comparacao PF x PJ"
```

### Task 3: Lead do comparativo (migration + Server Action)

**Files:**
- Create: `supabase/migrations/20261114000001_lead_origem_comparativo.sql`
- Create: `web/lib/actions/comparativo.js`
- Create: `web/lib/comparativo/contato.js`
- Test: `web/lib/comparativo/contato.test.mjs`

**Interfaces:**
- Consumes: `compararCenarios` (Task 2); `createAdminClient` (`@/lib/supabase/admin`); `enviarEmailResend`, `EMAIL_ADMIN` (`@/lib/email/resend`).
- Produces: `validarContato({ nome, whatsapp, email }): { ok: true, valor: { nome, whatsapp, email } } | { ok: false, erro: string }` (em `contato.js`): nome ≥ 2 caracteres; WhatsApp só dígitos com DDI opcional, 10–13 dígitos (normalizado para só dígitos); e-mail com formato válido.
- Produces: `capturarLeadComparativo(entrada): Promise<{ ok: true, resultado } | { ok: false, erro: string }>` (Server Action, `"use server"`) — recebe os contatos e os campos do comparativo, valida contato, recalcula `compararCenarios` **no servidor** (nunca confia em número vindo do client), tenta gravar `Lead` + uma `LeadNota` com o resumo e enviar e-mail ao ADM (ambos melhor esforço, erro engolido), e retorna `resultado` calculado. Honeypot: campo `site` preenchido → retorna `ok:true` sem gravar. Lê `pv_id` de `cookies()`.

- [ ] **Step 1: Write the failing test for `validarContato`**

Casos: nome de 1 letra rejeitado; WhatsApp `"(91) 98191-0295"` vira `"91981910295"`; com `+55` vira `"5591981910295"`; 9 e 14 dígitos rejeitados; e-mail sem `@` rejeitado; entradas `undefined` rejeitadas sem lançar.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test lib/comparativo/contato.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `contato.js`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test lib/comparativo/contato.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the migration** que troca o check `Lead_origem_check` para aceitar `'cadastro','manual','whatsapp','comparativo'` (mesmo padrão de `20260912000003_add_lead_whatsapp.sql`). Aplicar em produção pelo método de acesso ao banco documentado na memória do projeto (Management API do Supabase); migration só altera constraint, sem perda de dado. Conferir depois com um `select` em `pg_constraint`.

- [ ] **Step 6: Implement `capturarLeadComparativo` in `web/lib/actions/comparativo.js`** per Interfaces; o texto da nota inclui faturamento, despesas por categoria, líquido PF, líquido PJ e melhor opção.

- [ ] **Step 7: Verify against a local build** — Task 4 faz a verificação ponta a ponta com a página; aqui basta `cd web && npx next build` sem erros.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261114000001_lead_origem_comparativo.sql web/lib/actions/comparativo.js web/lib/comparativo
git commit -m "feat: captura de lead do comparativo"
```

### Task 4: Página `/comparativo`, rotas públicas, rastreio e SEO

**Files:**
- Create: `web/app/comparativo/page.js`, `web/app/comparativo/layout.js`, `web/app/comparativo/Comparativo.js` (client, 3 passos), `web/app/comparativo/comparativo.css`
- Modify: `web/proxy.js` (`PATHS_FUNIL`), `web/lib/supabase/proxy.js` (`PUBLIC_PATHS`), `web/app/sitemap.js`, `web/app/(auth)/cadastro/page.js` (aceitar `origem=comparativo`), `web/lib/actions/auth.js` (tratar `origem === "comparativo"` como origem válida, redirect continua `/painel`)

**Interfaces:**
- Consumes: `capturarLeadComparativo` (Task 3); `NUMERO_GESTOR`.
- Produces: rota pública `/comparativo`.

- [ ] **Step 1: Read `web/node_modules/next/dist/docs/` sections on routing and Server Actions** (Next 16), e `web/app/comece/layout.js` + `comece.css` para reaproveitar tokens e fontes (Sora/Inter).

- [ ] **Step 2: Implement the layout and page** (metadata: título, descrição e Open Graph próprios) e o componente client `Comparativo` com os 3 passos do mockup: formulário (faturamento, 5 categorias de despesa com os exemplos do spec em "Outros", contador com padrão 300), passo de contato com honeypot oculto, resultado com dois cartões, destaque da economia (mensal e anual) ou "PF compensa mais", gráfico de barras em SVG/CSS (líquido PF x líquido PJ), aviso de estimativa, botão WhatsApp (`https://wa.me/${NUMERO_GESTOR}?text=` com texto pré-preenchido citando o comparativo) e botão `/cadastro?origem=comparativo`. Desabilitar o botão de envio durante a requisição (duplo clique). Layout funciona em 375px.

- [ ] **Step 3: Register the route** — `/comparativo` em `PATHS_FUNIL` (igualdade exata, já é a lógica da lista), em `PUBLIC_PATHS` e no `sitemap.js`; ajustar `cadastro/page.js` e `auth.js` para a nova origem.

- [ ] **Step 4: Build and preview**

Run: `cd web && npm run build` e `npx next start` (nunca `next dev`; ver `psifacil_standalone_preview_testing` na memória se o projeto usar standalone).
Expected: build sem erro; `/comparativo` abre sem login (HTTP 200).

- [ ] **Step 5: Verify end to end com dados descartáveis**

No navegador (chrome-devtools MCP ou Playwright CLI contra build+preview): preencher faturamento 8.000 + despesas, ver tela de contato sem resultado visível, enviar contato, ver resultado com os dois cartões e os dois botões; conferir no banco que o `Lead` (`origem='comparativo'`) e a `LeadNota` foram criados e que o pageview de `/comparativo` entrou em `VisitaPagina`; enviar de novo com o mesmo telefone sem erro; apagar o lead/nota/visita de teste ao final. Conferir também 375px de largura e faturamento 0 (mensagem de erro).

- [ ] **Step 6: Commit**

```bash
git add web/app/comparativo web/proxy.js web/lib/supabase/proxy.js web/app/sitemap.js "web/app/(auth)/cadastro/page.js" web/lib/actions/auth.js
git commit -m "feat: pagina publica /comparativo (PF x PJ) com captura de lead"
```

### Task 5: Registro e pendências

**Files:**
- Modify: `docs/backlog.md` (novo item 36 em "Implementado" com observações e pendências), `docs/status-implementacao.md` (entrada curta)

- [ ] **Step 1: Registrar no backlog** o item (data, o que foi verificado, o que não foi) e as pendências: validação dos números por um contador antes de divulgar; deploy no EasyPanel (token); conferência final do redutor (bruto x base líquida).

- [ ] **Step 2: Commit**

```bash
git add docs/backlog.md docs/status-implementacao.md
git commit -m "docs: item 36 - comparativo PF x PJ implementado"
```
