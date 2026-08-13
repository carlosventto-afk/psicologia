# Exportar TXT do Carnê-Leão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar um arquivo `.txt` no layout "Recibos do Receita Saúde" do
Carnê-Leão Web, a partir dos pagamentos de sessão (`PagamentoSessao`) de
pacientes marcados como `documento = 'recibo'`, com opção de combinar
múltiplos atendimentos pagos juntos numa única linha/recibo.

**Architecture:** Camada de dados (`lib/data/carne-leao.js`) busca
pagamentos elegíveis via Supabase; camada de formatação pura
(`lib/carne-leao-txt.js`) monta as linhas no layout de 16 campos; uma tela
(`/carne-leao`) com Client Component (`CarneLeaoForm`) deixa o operador
selecionar/combinar linhas; um Route Handler POST (`/carne-leao/gerar`)
recalcula tudo a partir do banco (nunca confia em valor/CPF vindo do
client) e devolve o arquivo como download. Pré-requisito: nova tela
`/configuracoes/conta` pra cadastrar CPF do profissional (campo inexistente
hoje em `Usuarios`).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions +
Route Handlers), Supabase/PostgREST, sem framework de teste automatizado —
verificação via scripts Node descartáveis com `@supabase/supabase-js`
(service-role key) contra produção.

## Global Constraints

- Todo texto fixo do arquivo TXT é ASCII sem acento (`Atendimento
  psicologico`, não `psicológico`) — mesmo padrão dos exemplos oficiais da
  Receita Federal, evita risco de encoding na importação.
- CPF sempre 11 dígitos sem pontuação no arquivo final, mesmo que o cadastro
  tenha CPF formatado (`111.222.333-44`).
- Valor decimal com vírgula, sem separador de milhar (`242,85`).
- Geração sempre de **um mês por vez** — nunca intervalo livre (regra do
  próprio layout: "todos os pagamentos devem ser referentes ao mesmo ano").
- RLS já escopa `PagamentoSessao`/`Sessao`/`Paciente`/`Usuarios` por
  `owner`/`id_user` automaticamente — nenhuma query nova precisa filtrar
  por usuário manualmente.
- Reaproveitar classes CSS já existentes (`card`, `field`, `btn-primary`,
  `btn-outline`, `empty-state`, `link`, `page-title`) — sem CSS novo.
- Copy em português, consistente com o resto do app.
- Sem framework de build/dev local funcional (`next build`/`next dev`
  falham por um problema de rede com Google Fonts, pré-existente e não
  relacionado) — verificar cada task com `npx eslint <arquivos>` +
  scripts Node descartáveis contra o banco de produção (criar fixtures,
  testar, apagar fixtures). Verificação end-to-end no navegador fica
  pendente pra depois do deploy, mesmo padrão já usado nas últimas features
  desta sessão.

---

### Task 1: CPF do profissional — migration + dado

**Files:**
- Create: `supabase/migrations/20260813000003_add_cpf_usuarios.sql`
- Modify: `web/lib/data/usuario.js`

**Interfaces:**
- Produces: `buscarUsuarioAtual()` agora retorna também `cpf`, `crp`,
  `contato` (além dos campos que já retornava:
  `id, nome, whatsapp_number, whatsapp_verified, role, aprovado,
  criador_conteudo, plano`).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260813000003_add_cpf_usuarios.sql
alter table "Usuarios" add column cpf text;
```

- [ ] **Step 2: Aplicar a migration em produção**

Rodar via script Node (mesmo padrão já usado nas migrations anteriores da
sessão — não há Supabase CLI disponível neste ambiente):

```js
// scratchpad: aplicar-migration.mjs
import pg from "pg";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260813000003_add_cpf_usuarios.sql", "utf8");
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();
await client.query(sql);
await client.end();
console.log("Migration aplicada.");
```

Run: `node scratchpad/aplicar-migration.mjs`
Expected: "Migration aplicada." sem erro.

- [ ] **Step 3: Atualizar o select de `buscarUsuarioAtual`**

Em `web/lib/data/usuario.js`, trocar a string do `.select(...)`:

```js
.select(
  "id, nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano"
)
```

- [ ] **Step 4: Verificar com script descartável**

```js
// scratchpad/verificar-task1.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase.from("Usuarios").select("id, cpf, crp, contato").limit(1);
if (error) throw error;
console.log("Coluna cpf acessível, exemplo:", data[0]);
```

Run: `node scratchpad/verificar-task1.mjs`
Expected: imprime uma linha com a chave `cpf` presente (valor pode ser
`null`), sem erro de coluna inexistente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260813000003_add_cpf_usuarios.sql web/lib/data/usuario.js
git commit -m "feat: adiciona CPF ao cadastro do profissional (Usuarios.cpf)"
```

---

### Task 2: Tela "Meus Dados" (`/configuracoes/conta`)

**Files:**
- Create: `web/lib/actions/usuario.js`
- Create: `web/components/MeusDadosForm.js`
- Create: `web/app/(app)/(gestao)/configuracoes/conta/page.js`
- Modify: `web/components/icons/NavIcons.js`
- Modify: `web/components/SidebarNav.js`

**Interfaces:**
- Consumes: `buscarUsuarioAtual()` de `web/lib/data/usuario.js` (Task 1) —
  retorna `{ id, nome, cpf, crp, contato, ... }`.
- Produces: `atualizarMeusDados(prevState, formData)` — Server Action
  `useActionState`-compatible, retorna `{ error: string }` ou
  `{ sucesso: true }`.

- [ ] **Step 1: Criar a Server Action**

```js
// web/lib/actions/usuario.js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function atualizarMeusDados(prevState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contatoBruto = formData.get("contato");

  const dados = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || null,
    crp: formData.get("crp") || null,
    contato: contatoBruto ? Number(String(contatoBruto).replace(/\D/g, "")) : null,
  };

  const { error } = await supabase.from("Usuarios").update(dados).eq("id_user", user.id);

  if (error) {
    return { error: "Não foi possível salvar seus dados." };
  }

  revalidatePath("/configuracoes/conta");
  revalidatePath("/carne-leao");
  return { sucesso: true };
}
```

- [ ] **Step 2: Criar o formulário (Client Component)**

```jsx
// web/components/MeusDadosForm.js
"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function MeusDadosForm({ action, usuario }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-md space-y-4 card p-6">
      <div>
        <label htmlFor="nome" className="block text-sm font-semibold text-navy">
          Nome completo
        </label>
        <input id="nome" name="nome" type="text" required defaultValue={usuario?.nome} className="field" />
      </div>

      <div>
        <label htmlFor="cpf" className="block text-sm font-semibold text-navy">
          CPF
        </label>
        <input id="cpf" name="cpf" type="text" defaultValue={usuario?.cpf ?? ""} className="field" />
        <p className="text-xs text-muted mt-1">
          Obrigatório para gerar o TXT do Carnê-Leão — precisa ser o mesmo CPF de login no Carnê-Leão Web.
        </p>
      </div>

      <div>
        <label htmlFor="crp" className="block text-sm font-semibold text-navy">
          Registro profissional (CRP)
        </label>
        <input id="crp" name="crp" type="text" defaultValue={usuario?.crp ?? ""} className="field" />
      </div>

      <div>
        <label htmlFor="contato" className="block text-sm font-semibold text-navy">
          Celular
        </label>
        <input id="contato" name="contato" type="text" defaultValue={usuario?.contato ?? ""} className="field" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.sucesso && <p className="text-sm text-green-700">Dados salvos.</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Criar a página**

```jsx
// web/app/(app)/(gestao)/configuracoes/conta/page.js
import MeusDadosForm from "@/components/MeusDadosForm";
import { atualizarMeusDados } from "@/lib/actions/usuario";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function PaginaMeusDados() {
  const usuario = await buscarUsuarioAtual();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Meus Dados</h1>
      <MeusDadosForm action={atualizarMeusDados} usuario={usuario} />
    </div>
  );
}
```

- [ ] **Step 4: Adicionar ícone novo**

Em `web/components/icons/NavIcons.js`, adicionar (mesmo padrão `base` das
outras funções do arquivo):

```jsx
export function IconeContaUsuario(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="14" height="11" rx="2" />
      <circle cx="7.5" cy="9" r="1.6" />
      <path d="M5.5 13c.4-1.3 1.3-2 2-2s1.6.7 2 2" />
      <path d="M11.5 8h3M11.5 11h3" />
    </svg>
  );
}
```

- [ ] **Step 5: Adicionar link na sidebar**

Em `web/components/SidebarNav.js`:
- Adicionar `IconeContaUsuario` ao import de `@/components/icons/NavIcons`.
- Adicionar item em `ITENS_NAV`, logo antes do item de WhatsApp:

```js
{ href: "/configuracoes/conta", label: "Meus Dados", Icone: IconeContaUsuario },
```

- [ ] **Step 6: Lint**

Run: `npx eslint web/lib/actions/usuario.js web/components/MeusDadosForm.js web/app/\(app\)/\(gestao\)/configuracoes/conta/page.js web/components/icons/NavIcons.js web/components/SidebarNav.js`
Expected: sem erros.

- [ ] **Step 7: Verificar com script descartável (fixture + cleanup)**

```js
// scratchpad/verificar-task2.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Usa o primeiro usuário real só pra ler/restaurar (não cria usuário novo —
// Usuarios depende de auth.users, criar um de teste é desproporcional aqui).
const { data: antes, error: erroAntes } = await supabase.from("Usuarios").select("id, cpf, crp, contato").limit(1).single();
if (erroAntes) throw erroAntes;

const { error: erroUpdate } = await supabase
  .from("Usuarios")
  .update({ cpf: "12345678901" })
  .eq("id", antes.id);
if (erroUpdate) throw erroUpdate;

const { data: depois, error: erroDepois } = await supabase.from("Usuarios").select("cpf").eq("id", antes.id).single();
if (erroDepois) throw erroDepois;
if (depois.cpf !== "12345678901") throw new Error("Update não refletiu");

// Restaura o valor original
const { error: erroRestaurar } = await supabase.from("Usuarios").update({ cpf: antes.cpf }).eq("id", antes.id);
if (erroRestaurar) throw erroRestaurar;

console.log("OK: update de cpf funciona e foi restaurado.");
```

Run: `node scratchpad/verificar-task2.mjs`
Expected: "OK: update de cpf funciona e foi restaurado."

- [ ] **Step 8: Commit**

```bash
git add web/lib/actions/usuario.js web/components/MeusDadosForm.js "web/app/(app)/(gestao)/configuracoes/conta/page.js" web/components/icons/NavIcons.js web/components/SidebarNav.js
git commit -m "feat: tela Meus Dados para o profissional cadastrar CPF/CRP/celular"
```

---

### Task 3: Formatação pura do layout TXT

**Files:**
- Create: `web/lib/carne-leao-txt.js`

**Interfaces:**
- Produces:
  - `formatarCpf(cpf: string|null): string` — só dígitos, `""` se vazio.
  - `formatarValor(valor: number|string): string` — `"242,85"`.
  - `formatarDataBR(dataISO: string): string` — `"2026-08-24"` → `"24/08/2026"`.
  - `montarDescricao(datasAtendimentoISO: string[]): string`.
  - `montarLinha({ dataPagamento, valor, descricao, cpfPagador, cpfBeneficiario, cpfProfissional, crpProfissional }): string`
    — uma linha de 16 campos separados por `;`.
  - `montarArquivoTxt(linhas: Array<{dataPagamento, valor, descricao, cpfPagador, cpfBeneficiario}>, profissional: {cpf, crp}): string`
    — linhas unidas por `\r\n`.

- [ ] **Step 1: Escrever o módulo**

```js
// web/lib/carne-leao-txt.js
export function formatarCpf(cpf) {
  return String(cpf ?? "").replace(/\D/g, "");
}

export function formatarValor(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

export function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function montarDescricao(datasAtendimentoISO) {
  if (datasAtendimentoISO.length <= 1) return "Atendimento psicologico";
  const datas = datasAtendimentoISO
    .slice()
    .sort()
    .map(formatarDataBR)
    .join(", ");
  return `Atendimentos psicologicos realizados em: ${datas}`;
}

export function montarLinha({
  dataPagamento,
  valor,
  descricao,
  cpfPagador,
  cpfBeneficiario,
  cpfProfissional,
  crpProfissional,
}) {
  const campos = [
    formatarDataBR(dataPagamento),
    "R01.001.001",
    "255",
    formatarValor(valor),
    "",
    descricao,
    "PF",
    formatarCpf(cpfPagador),
    formatarCpf(cpfBeneficiario),
    "",
    "",
    "",
    "",
    "S",
    formatarCpf(cpfProfissional),
    crpProfissional ?? "",
  ];
  return campos.join(";");
}

export function montarArquivoTxt(linhas, profissional) {
  return linhas
    .map((linha) =>
      montarLinha({
        ...linha,
        cpfProfissional: profissional.cpf,
        crpProfissional: profissional.crp,
      })
    )
    .join("\r\n");
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint web/lib/carne-leao-txt.js`
Expected: sem erros.

- [ ] **Step 3: Verificar com script Node (sem banco — funções puras)**

```js
// scratchpad/verificar-task3.mjs
import {
  formatarCpf,
  formatarValor,
  formatarDataBR,
  montarDescricao,
  montarLinha,
  montarArquivoTxt,
} from "../web/lib/carne-leao-txt.js";

console.assert(formatarCpf("111.222.333-44") === "11122233344", "formatarCpf falhou");
console.assert(formatarValor(242.8) === "242,80", "formatarValor falhou");
console.assert(formatarDataBR("2026-08-24") === "24/08/2026", "formatarDataBR falhou");
console.assert(montarDescricao(["2026-08-10"]) === "Atendimento psicologico", "descricao simples falhou");
console.assert(
  montarDescricao(["2026-08-12", "2026-08-05"]) === "Atendimentos psicologicos realizados em: 05/08/2026, 12/08/2026",
  "descricao combinada falhou"
);

const linha = montarLinha({
  dataPagamento: "2026-08-24",
  valor: 242.85,
  descricao: "Atendimento psicologico",
  cpfPagador: "13614435709",
  cpfBeneficiario: "13614435709",
  cpfProfissional: "98765432100",
  crpProfissional: "06/12345",
});
const esperado =
  "24/08/2026;R01.001.001;255;242,85;;Atendimento psicologico;PF;13614435709;13614435709;;;;;S;98765432100;06/12345";
console.assert(linha === esperado, `linha não bate.\nrecebido: ${linha}\nesperado: ${esperado}`);
console.assert(linha.split(";").length === 16, "linha não tem 16 campos");

const arquivo = montarArquivoTxt(
  [
    { dataPagamento: "2026-08-01", valor: 100, descricao: "Atendimento psicologico", cpfPagador: "1", cpfBeneficiario: "1" },
    { dataPagamento: "2026-08-02", valor: 200, descricao: "Atendimento psicologico", cpfPagador: "2", cpfBeneficiario: "2" },
  ],
  { cpf: "98765432100", crp: "06/12345" }
);
console.assert(arquivo.split("\r\n").length === 2, "arquivo com 2 linhas falhou");

console.log("OK: todas as asserções passaram.");
```

Run: `node scratchpad/verificar-task3.mjs`
Expected: "OK: todas as asserções passaram." (sem "Assertion failed" no meio)

- [ ] **Step 4: Commit**

```bash
git add web/lib/carne-leao-txt.js
git commit -m "feat: formatacao pura do layout TXT Recibos Receita Saude"
```

---

### Task 4: Query de pagamentos elegíveis

**Files:**
- Create: `web/lib/data/carne-leao.js`

**Interfaces:**
- Consumes: nada de tasks anteriores diretamente (usa `createClient` de
  `@/lib/supabase/server` e `normalizarIds`/`normalizarIdsLista` de
  `@/lib/normalizar-ids`, ambos já existentes).
- Produces:
  - `listarPagamentosElegiveis({ dataInicio, dataFim }): Promise<{ elegiveis: Item[], semCpf: Item[] }>`
  - `buscarPagamentosPorIds(ids: number[]): Promise<Item[]>` (só os
    totalmente elegíveis, ids não encontrados são omitidos)
  - Onde `Item = { pagamentoId, valor, dataPagamento, dataAtendimento,
    pacienteNome, pagadorNome, cpfPagador, cpfBeneficiario }`

- [ ] **Step 1: Escrever o módulo**

```js
// web/lib/data/carne-leao.js
import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, Sessao!inner(data, Paciente!inner(nome, cpf, dependente, documento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf)))";

function resolverPagamento(p) {
  const paciente = p.Sessao.Paciente;
  const responsavel = paciente.ResponsavelFinanceiro;
  const cpfPagador = paciente.dependente ? responsavel?.cpf || null : paciente.cpf || null;

  return {
    pagamentoId: p.id,
    valor: p.valor,
    dataPagamento: p.data_pagamento,
    dataAtendimento: p.Sessao.data,
    pacienteNome: paciente.nome,
    pagadorNome: paciente.dependente ? responsavel?.nome ?? paciente.nome : paciente.nome,
    cpfPagador,
    cpfBeneficiario: paciente.cpf || null,
  };
}

export async function listarPagamentosElegiveis({ dataInicio, dataFim }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("data_pagamento", dataInicio)
    .lte("data_pagamento", dataFim)
    .order("data_pagamento");

  if (error) throw new Error(error.message);

  const resolvidos = normalizarIdsLista(data, ["id"]).map(resolverPagamento);

  return {
    elegiveis: resolvidos.filter((p) => p.cpfPagador && p.cpfBeneficiario),
    semCpf: resolvidos.filter((p) => !p.cpfPagador || !p.cpfBeneficiario),
  };
}

export async function buscarPagamentosPorIds(ids) {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .in("id", ids)
    .eq("Sessao.Paciente.documento", "recibo");

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .map(resolverPagamento)
    .filter((p) => p.cpfPagador && p.cpfBeneficiario);
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint web/lib/data/carne-leao.js`
Expected: sem erros.

- [ ] **Step 3: Verificar com script descartável (fixtures reais + cleanup)**

Este script replica a mesma query (via service-role, que ignora RLS — a
lógica de filtro é idêntica, só muda quem está autenticado) contra dados
descartáveis, pra validar o filtro de `documento`, o período e a resolução
de `cpfPagador`/`cpfBeneficiario` (caso simples e caso dependente).

```js
// scratchpad/verificar-task4.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: consultorio } = await supabase.from("Consultorio").select("id").limit(1).single();

// Paciente titular (não dependente), documento = recibo, com CPF
const { data: titular } = await supabase
  .from("Paciente")
  .insert({
    nome: "Teste CarneLeao Titular",
    consultorio: consultorio.id,
    valor_sessao: 200,
    documento: "recibo",
    cpf: "11111111111",
  })
  .select("id")
  .single();

// Paciente dependente de outro responsável, com CPF; responsável com CPF
const { data: responsavel } = await supabase
  .from("Paciente")
  .insert({ nome: "Teste CarneLeao Responsavel", consultorio: consultorio.id, valor_sessao: 200, cpf: "22222222222" })
  .select("id")
  .single();

const { data: dependente } = await supabase
  .from("Paciente")
  .insert({
    nome: "Teste CarneLeao Dependente",
    consultorio: consultorio.id,
    valor_sessao: 200,
    documento: "recibo",
    cpf: "33333333333",
    dependente: true,
    responsavel_financeiro: responsavel.id,
  })
  .select("id")
  .single();

// Paciente documento = nota_fiscal (não deve aparecer)
const { data: notaFiscal } = await supabase
  .from("Paciente")
  .insert({ nome: "Teste CarneLeao NF", consultorio: consultorio.id, valor_sessao: 200, documento: "nota_fiscal", cpf: "44444444444" })
  .select("id")
  .single();

const pacientesCriados = [titular.id, responsavel.id, dependente.id, notaFiscal.id];

const sessoesCriadas = [];
const pagamentosCriados = [];

async function criarPagamento(pacienteId, dataSessao, dataPagamento) {
  const { data: sessao } = await supabase
    .from("Sessao")
    .insert({ paciente: pacienteId, consultorio: consultorio.id, data: dataSessao, horario: "10:00", Realizado: true })
    .select("id")
    .single();
  sessoesCriadas.push(sessao.id);

  const { data: pagamento } = await supabase
    .from("PagamentoSessao")
    .insert({ sessao: sessao.id, valor: 200, data_pagamento: dataPagamento })
    .select("id")
    .single();
  pagamentosCriados.push(pagamento.id);
  return pagamento.id;
}

const idTitular = await criarPagamento(titular.id, "2026-08-10", "2026-08-10");
const idDependente = await criarPagamento(dependente.id, "2026-08-12", "2026-08-12");
await criarPagamento(notaFiscal.id, "2026-08-15", "2026-08-15"); // não deve entrar

// Replica a query de listarPagamentosElegiveis pro período de agosto/2026
const { data: bruto, error } = await supabase
  .from("PagamentoSessao")
  .select(
    "id, valor, data_pagamento, Sessao!inner(data, Paciente!inner(nome, cpf, dependente, documento, ResponsavelFinanceiro:responsavel_financeiro(nome, cpf)))"
  )
  .eq("Sessao.Paciente.documento", "recibo")
  .gte("data_pagamento", "2026-08-01")
  .lte("data_pagamento", "2026-08-31")
  .in("id", pagamentosCriados);

if (error) throw error;

if (bruto.length !== 2) throw new Error(`Esperado 2 pagamentos elegíveis, veio ${bruto.length}`);

const porId = Object.fromEntries(bruto.map((p) => [Number(p.id), p]));
const linhaTitular = porId[idTitular];
const linhaDependente = porId[idDependente];

if (linhaTitular.Sessao.Paciente.cpf !== "11111111111") throw new Error("CPF do titular não bate");
if (linhaDependente.Sessao.Paciente.ResponsavelFinanceiro.cpf !== "22222222222")
  throw new Error("CPF do responsável do dependente não bate");
if (linhaDependente.Sessao.Paciente.cpf !== "33333333333") throw new Error("CPF do beneficiário dependente não bate");

console.log("OK: filtro por documento e resolução de CPF pagador/beneficiário corretos.");

// Cleanup — ordem inversa das dependências
await supabase.from("PagamentoSessao").delete().in("id", pagamentosCriados);
await supabase.from("Sessao").delete().in("id", sessoesCriadas);
await supabase.from("Paciente").delete().in("id", pacientesCriados);

console.log("Fixtures removidas.");
```

Run: `node scratchpad/verificar-task4.mjs`
Expected: "OK: filtro por documento e resolução de CPF pagador/beneficiário
corretos." seguido de "Fixtures removidas.", sem erro no meio.

- [ ] **Step 4: Commit**

```bash
git add web/lib/data/carne-leao.js
git commit -m "feat: query de pagamentos elegiveis para o Carne-Leao"
```

---

### Task 5: Tela `/carne-leao`

**Files:**
- Create: `web/components/CarneLeaoForm.js`
- Create: `web/app/(app)/(gestao)/carne-leao/page.js`
- Modify: `web/components/icons/NavIcons.js`
- Modify: `web/components/SidebarNav.js`

**Interfaces:**
- Consumes: `listarPagamentosElegiveis` (Task 4), `buscarUsuarioAtual`
  (Task 1), helpers já existentes de `@/lib/periodo-agenda`
  (`calcularPeriodo`, `hojeISO`, `deslocarData`, `formatarRotuloPeriodo`).
- Produces: formulário HTML que faz `POST` pra `/carne-leao/gerar` (Task 6)
  com campos `mes`, `ano`, `grupos` (JSON stringificado de
  `number[][]` — arrays de `pagamentoId`).

- [ ] **Step 1: Criar o Client Component de seleção/combinação**

```jsx
// web/components/CarneLeaoForm.js
"use client";

import { useState } from "react";

export default function CarneLeaoForm({ porPagador, mes, ano }) {
  const [gruposPorPagador, setGruposPorPagador] = useState(() =>
    Object.fromEntries(porPagador.map((p) => [p.cpfPagador, p.pagamentos.map((item) => [item.pagamentoId])]))
  );
  const [selecionados, setSelecionados] = useState({});

  function alternarSelecao(cpfPagador, id) {
    setSelecionados((atual) => {
      const lista = atual[cpfPagador] ?? [];
      const nova = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      return { ...atual, [cpfPagador]: nova };
    });
  }

  function combinar(cpfPagador) {
    const ids = selecionados[cpfPagador] ?? [];
    if (ids.length < 2) return;
    setGruposPorPagador((atual) => {
      const grupos = atual[cpfPagador];
      const restante = grupos.filter((grupo) => !grupo.some((id) => ids.includes(id)));
      return { ...atual, [cpfPagador]: [...restante, ids] };
    });
    setSelecionados((atual) => ({ ...atual, [cpfPagador]: [] }));
  }

  const todosGrupos = Object.values(gruposPorPagador).flat();

  return (
    <form method="POST" action="/carne-leao/gerar" className="space-y-4">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="grupos" value={JSON.stringify(todosGrupos)} />

      {porPagador.map((pagador) => {
        const grupos = gruposPorPagador[pagador.cpfPagador];
        const porId = Object.fromEntries(pagador.pagamentos.map((item) => [item.pagamentoId, item]));
        const selecionadosDoPagador = selecionados[pagador.cpfPagador] ?? [];

        return (
          <div key={pagador.cpfPagador} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-navy">{pagador.pagadorNome}</p>
              <button
                type="button"
                onClick={() => combinar(pagador.cpfPagador)}
                disabled={selecionadosDoPagador.length < 2}
                className="btn-outline py-1 px-2 text-xs disabled:opacity-50"
              >
                Combinar em um recibo
              </button>
            </div>

            <div className="space-y-2">
              {grupos.map((grupoIds, index) => {
                const itens = grupoIds.map((id) => porId[id]).filter(Boolean);
                if (itens.length === 0) return null;
                const combinado = itens.length > 1;
                return (
                  <div
                    key={index}
                    className="text-sm space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0"
                  >
                    {combinado && (
                      <p className="text-muted text-xs">{itens.length} atendimentos combinados em um recibo</p>
                    )}
                    {itens.map((item) => (
                      <label key={item.pagamentoId} className="flex items-center gap-2 text-navy">
                        <input
                          type="checkbox"
                          checked={selecionadosDoPagador.includes(item.pagamentoId)}
                          disabled={combinado}
                          onChange={() => alternarSelecao(pagador.cpfPagador, item.pagamentoId)}
                        />
                        {item.dataPagamento} — R$ {Number(item.valor).toFixed(2)}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button type="submit" className="btn-primary">
        Gerar TXT
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Criar a página**

```jsx
// web/app/(app)/(gestao)/carne-leao/page.js
import Link from "next/link";
import { listarPagamentosElegiveis } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { calcularPeriodo, hojeISO, deslocarData, formatarRotuloPeriodo } from "@/lib/periodo-agenda";
import CarneLeaoForm from "@/components/CarneLeaoForm";

export default async function PaginaCarneLeao({ searchParams }) {
  const { data = hojeISO() } = await searchParams;
  const { inicio, fim } = calcularPeriodo("mes", data);

  const [usuario, { elegiveis, semCpf }] = await Promise.all([
    buscarUsuarioAtual(),
    listarPagamentosElegiveis({ dataInicio: inicio, dataFim: fim }),
  ]);

  const anterior = deslocarData(data, "mes", -1);
  const proximo = deslocarData(data, "mes", 1);
  const rotulo = formatarRotuloPeriodo("mes", data, inicio, fim);
  const [ano, mes] = inicio.split("-");

  const porPagador = Object.values(
    elegiveis.reduce((acc, item) => {
      const chave = item.cpfPagador;
      if (!acc[chave]) acc[chave] = { cpfPagador: chave, pagadorNome: item.pagadorNome, pagamentos: [] };
      acc[chave].pagamentos.push(item);
      return acc;
    }, {})
  );

  return (
    <div className="space-y-4">
      <h1 className="page-title">Carnê-Leão</h1>

      <div className="flex items-center gap-2">
        <Link href={`/carne-leao?data=${anterior}`} className="btn-outline px-3 py-1.5" aria-label="Mês anterior">
          ‹
        </Link>
        <Link href={`/carne-leao?data=${hojeISO()}`} className="btn-outline py-1.5">
          Hoje
        </Link>
        <Link href={`/carne-leao?data=${proximo}`} className="btn-outline px-3 py-1.5" aria-label="Próximo mês">
          ›
        </Link>
        <span className="text-sm font-bold text-navy ml-2">{rotulo}</span>
      </div>

      {!usuario.cpf && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          Cadastre seu CPF em{" "}
          <Link href="/configuracoes/conta" className="underline font-semibold">
            Meus Dados
          </Link>{" "}
          antes de gerar o arquivo — ele é obrigatório no layout do Carnê-Leão.
        </p>
      )}

      {semCpf.length > 0 && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          {semCpf.length} pagamento(s) não aparecem na lista abaixo por falta de CPF no cadastro do paciente ou
          responsável financeiro: {semCpf.map((p) => p.pacienteNome).join(", ")}.
        </p>
      )}

      {elegiveis.length === 0 ? (
        <p className="empty-state">Nenhum pagamento elegível para o Carnê-Leão neste mês.</p>
      ) : usuario.cpf ? (
        <CarneLeaoForm porPagador={porPagador} mes={mes} ano={ano} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Adicionar ícone novo**

Em `web/components/icons/NavIcons.js`:

```jsx
export function IconeCarneLeao(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3v9" />
      <path d="M6.5 8.5 10 12l3.5-3.5" />
      <path d="M4 14v1.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V14" />
    </svg>
  );
}
```

- [ ] **Step 4: Adicionar link na sidebar**

Em `web/components/SidebarNav.js`, adicionar `IconeCarneLeao` ao import e o
item em `ITENS_NAV` logo depois de "Recibos":

```js
{ href: "/carne-leao", label: "Carnê-Leão", Icone: IconeCarneLeao },
```

- [ ] **Step 5: Lint**

Run: `npx eslint web/components/CarneLeaoForm.js "web/app/(app)/(gestao)/carne-leao/page.js" web/components/icons/NavIcons.js web/components/SidebarNav.js`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add web/components/CarneLeaoForm.js "web/app/(app)/(gestao)/carne-leao/page.js" web/components/icons/NavIcons.js web/components/SidebarNav.js
git commit -m "feat: tela /carne-leao com selecao e combinacao de pagamentos"
```

---

### Task 6: Route Handler de geração do TXT

**Files:**
- Create: `web/app/(app)/(gestao)/carne-leao/gerar/route.js`

**Interfaces:**
- Consumes: `buscarPagamentosPorIds` (Task 4), `buscarUsuarioAtual`
  (Task 1), `montarDescricao`/`montarArquivoTxt` (Task 3). Recebe `POST`
  com `FormData`: `mes`, `ano`, `grupos` (JSON de `number[][]`) — mesmo
  formato produzido pelo formulário da Task 5.
- Produces: `Response` com corpo texto e headers de download
  (`Content-Disposition: attachment`).

- [ ] **Step 1: Escrever o Route Handler**

```js
// web/app/(app)/(gestao)/carne-leao/gerar/route.js
import { buscarPagamentosPorIds } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { montarDescricao, montarArquivoTxt } from "@/lib/carne-leao-txt";

export async function POST(request) {
  const formData = await request.formData();
  const mes = formData.get("mes");
  const ano = formData.get("ano");

  let grupos;
  try {
    grupos = JSON.parse(formData.get("grupos") || "[]");
  } catch {
    return new Response("Dados de agrupamento inválidos.", { status: 400 });
  }

  const usuario = await buscarUsuarioAtual();
  if (!usuario.cpf) {
    return new Response("CPF do profissional não cadastrado. Preencha em /configuracoes/conta.", { status: 400 });
  }

  const todosIds = [...new Set(grupos.flat())];
  const pagamentos = await buscarPagamentosPorIds(todosIds);
  const porId = new Map(pagamentos.map((p) => [p.pagamentoId, p]));

  const linhas = [];
  for (const grupoIds of grupos) {
    const itens = grupoIds.map((id) => porId.get(id)).filter(Boolean);
    if (itens.length === 0) continue;

    // Nunca confia no agrupamento do client — reagrupa por CPF do
    // pagador real (vindo do banco) antes de montar cada linha.
    const porPagador = new Map();
    for (const item of itens) {
      const lista = porPagador.get(item.cpfPagador) ?? [];
      lista.push(item);
      porPagador.set(item.cpfPagador, lista);
    }

    for (const subGrupo of porPagador.values()) {
      const valorTotal = subGrupo.reduce((soma, i) => soma + Number(i.valor), 0);
      const dataPagamento = subGrupo.reduce(
        (maisRecente, i) => (i.dataPagamento > maisRecente ? i.dataPagamento : maisRecente),
        subGrupo[0].dataPagamento
      );
      const descricao = montarDescricao(subGrupo.map((i) => i.dataAtendimento));

      linhas.push({
        dataPagamento,
        valor: valorTotal,
        descricao,
        cpfPagador: subGrupo[0].cpfPagador,
        cpfBeneficiario: subGrupo[0].cpfBeneficiario,
      });
    }
  }

  if (linhas.length === 0) {
    return new Response("Nenhum pagamento válido para gerar o arquivo.", { status: 400 });
  }

  const conteudo = montarArquivoTxt(linhas, usuario);
  const nomeArquivo = `carne-leao-${String(mes).padStart(2, "0")}-${ano}.txt`;

  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint "web/app/(app)/(gestao)/carne-leao/gerar/route.js"`
Expected: sem erros.

- [ ] **Step 3: Revisão manual da lógica de reagrupamento**

Não há como fazer uma chamada HTTP real contra este Route Handler neste
ambiente (sem `next dev`/`next build` funcionais — problema de rede
pré-existente com Google Fonts, não relacionado a esta feature). A lógica
de reagrupamento por `cpfPagador` e o cálculo de valor/data/descrição já
foram cobertos pelas Tasks 3 e 4 (funções puras testadas isoladamente +
query testada com fixtures reais). Reler o Step 1 e confirmar visualmente:
- IDs de grupos que não existem mais em `buscarPagamentosPorIds` são
  simplesmente omitidos (`filter(Boolean)`), sem quebrar o resto.
- Um grupo combinado que misture pagadores diferentes (não deveria
  acontecer pela UI da Task 5, mas o servidor não confia nisso) é
  dividido em sub-linhas por `cpfPagador` antes de gerar.
- Verificação end-to-end real (clicar em "Gerar TXT" e conferir o arquivo
  baixado) fica pendente pra depois do deploy, mesmo padrão já usado nas
  últimas features desta sessão.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(app)/(gestao)/carne-leao/gerar/route.js"
git commit -m "feat: route handler que gera e baixa o TXT do Carne-Leao"
```

---

## Pós-implementação

Atualizar `docs/backlog.md`: mover item 8 de "A realizar" pra
"Implementado", com data e nota sobre verificação end-to-end pendente
(mesmo padrão dos itens 6 e 11-metade-1). Não fazer isso como parte de
nenhuma task acima — é um commit separado, depois que a
`finishing-a-development-branch` skill rodar.
