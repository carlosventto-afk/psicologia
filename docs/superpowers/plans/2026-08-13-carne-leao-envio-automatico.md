# Envio Automático do Carnê-Leão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar o envio periódico (semanal/quinzenal/mensal) do TXT
do Carnê-Leão por e-mail, sem exigir login — um n8n externo (implantado
separadamente, fora deste plano) dispara um único endpoint HTTP que decide
quem está na data, gera o conteúdo, e devolve pro n8n distribuir por
e-mail.

**Architecture:** Um endpoint novo (`POST /carne-leao-automatico`), fora do
grupo de rotas autenticado, protegido por um segredo compartilhado em vez
de sessão de usuário. Usa o Supabase **service-role** (`createAdminClient`,
já existente em `web/lib/supabase/admin.js`) pra iterar todos os
profissionais configurados, escopando manualmente cada query por
`Sessao.owner` (já que o service-role ignora RLS). Reaproveita ao máximo o
código já existente do item 8 (`listarPagamentosElegiveis`,
`montarArquivoTxt`), com pequenas extensões aditivas.

**Tech Stack:** Next.js 16 App Router (Route Handler), Supabase
(`@supabase/supabase-js` service-role client), JavaScript puro (sem
biblioteca de datas — mesmo padrão de `web/lib/periodo-agenda.js`, que já
usa `Date` nativo em UTC).

**Spec:** `docs/superpowers/specs/2026-08-13-carne-leao-envio-automatico-design.md`

## Global Constraints

- Toda config de banco/e-mail: `carne_leao_frequencia` só aceita
  `'semanal' | 'quinzenal' | 'mensal'` ou `null` (desativado).
  `carne_leao_email` nulo = usa o e-mail de login (Supabase Auth) do
  profissional.
- O endpoint `/carne-leao-automatico` **nunca** deve rodar sem o header
  `X-Cron-Secret` batendo com a env var `CARNE_LEAO_CRON_SECRET` — checar
  isso é sempre o primeiro passo, antes de qualquer query.
- Delta desde o último envio **nunca cruza virada de mês** (capado no
  início/fim do mês corrente) — é assim que este design evita duplicidade
  sem depender do item 10 (ainda não implementado).
- `carne_leao_ultimo_envio` só é atualizado depois de gerar o conteúdo com
  sucesso — nunca antes, nunca em caso de erro na geração.
- Reaproveitar `listarPagamentosElegiveis`, `montarArquivoTxt`,
  `montarDescricao`, `cpfValido` já existentes — não duplicar lógica de
  resolução de pagamento/CPF.
- Nenhum pagamento sem CPF válido (pagador ou beneficiário) entra no
  arquivo — mesma regra do item 8, `listarPagamentosElegiveis` já filtra
  isso via `elegivel(p)`.
- Sem framework de teste automatizado neste repo, sem `next build`/`next
  dev` funcionando localmente (limitação de ambiente pré-existente, não
  relacionada a este trabalho). Verificação é sempre `npx eslint <files>`
  (rodado de dentro de `web/`) + scripts Node avulsos — puros quando
  possível, contra o Supabase de produção com dados descartáveis
  (criados e apagados no mesmo script, com `try/finally`) quando envolver
  banco.

---

## File Structure

- `supabase/migrations/20260813000004_add_envio_automatico_carne_leao.sql`
  (novo) — colunas em `Usuarios` + tabela `EnvioAutomaticoCarneLeao`.
- `web/lib/data/usuario.js` (modificar) — `buscarUsuarioAtual()` passa a
  retornar os 3 campos novos.
- `web/lib/actions/usuario.js` (modificar) — `atualizarMeusDados` grava os
  2 campos novos editáveis pelo usuário (frequência, e-mail).
- `web/components/MeusDadosForm.js` (modificar) — 2 campos novos no
  formulário.
- `web/lib/carne-leao-txt.js` (modificar) — nova função pura
  `agruparEmLinhas(itens)`, extraída do que hoje está duplicado dentro da
  rota manual.
- `web/app/(app)/(gestao)/carne-leao/gerar/route.js` (modificar) — passa a
  chamar `agruparEmLinhas` em vez de repetir a lógica de agrupamento
  inline (comportamento idêntico, só DRY).
- `web/lib/carne-leao-automacao.js` (novo) — funções puras de
  data/período: `estaNaData(frequencia, ultimoEnvio, hojeISO)` e
  `periodoParaEnvio(frequencia, ultimoEnvio, hojeISO)`.
- `web/lib/data/carne-leao.js` (modificar) — `listarPagamentosElegiveis`
  aceita um segundo parâmetro opcional `{ supabase, ownerId }` pra ser
  chamada com o client service-role escopado por profissional (sem quebrar
  a chamada existente, que continua funcionando sem esse parâmetro).
- `web/app/carne-leao-automatico/route.js` (novo) — o endpoint em si.
- `web/lib/supabase/proxy.js` (modificar) — adiciona
  `/carne-leao-automatico` a `PUBLIC_PATHS`.

---

### Task 1: Schema — frequência/e-mail/último envio + tabela de auditoria

**Files:**
- Create: `supabase/migrations/20260813000004_add_envio_automatico_carne_leao.sql`
- Modify: `web/lib/data/usuario.js`

**Interfaces:**
- Produces: `buscarUsuarioAtual()` agora retorna também
  `carne_leao_frequencia` (`string | null`), `carne_leao_email`
  (`string | null`), `carne_leao_ultimo_envio` (`string | null`, formato
  `yyyy-mm-dd`).

- [ ] **Step 1: Escrever e aplicar a migration**

```sql
-- supabase/migrations/20260813000004_add_envio_automatico_carne_leao.sql
alter table "Usuarios"
  add column carne_leao_frequencia text check (carne_leao_frequencia in ('semanal', 'quinzenal', 'mensal')),
  add column carne_leao_email text,
  add column carne_leao_ultimo_envio date;

create table "EnvioAutomaticoCarneLeao" (
  id bigint generated by default as identity primary key,
  usuario bigint not null references "Usuarios"(id),
  executado_em timestamptz not null default now(),
  sucesso boolean not null,
  mensagem_erro text,
  quantidade_linhas int not null default 0
);
```

Aplicar contra produção com um script Node avulso usando `pg` direto
(mesmo padrão já usado nas migrations anteriores deste projeto — ver
qualquer migration recente pra copiar a string de conexão:
`postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`,
com `SUPABASE_DB_PASSWORD` vindo de `web/.env.local`).

- [ ] **Step 2: Verificar a migration**

Script Node avulso (scratchpad) consultando
`select carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio from "Usuarios" limit 1`
e `select count(*) from "EnvioAutomaticoCarneLeao"` — confirmar que ambos
respondem sem erro (colunas/tabela existem).

- [ ] **Step 3: Atualizar `buscarUsuarioAtual()`**

```js
// web/lib/data/usuario.js
export async function buscarUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("Usuarios")
    .select(
      "id, nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano, carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio"
    )
    .eq("id_user", user.id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id"]);
}
```

- [ ] **Step 4: Rodar eslint**

Run: `cd web && npx eslint lib/data/usuario.js`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260813000004_add_envio_automatico_carne_leao.sql web/lib/data/usuario.js
git commit -m "feat: schema de envio automatico do Carne-Leao (frequencia/email/auditoria)"
```

---

### Task 2: Tela — configurar frequência e e-mail em `/configuracoes/conta`

**Files:**
- Modify: `web/lib/actions/usuario.js`
- Modify: `web/components/MeusDadosForm.js`

**Interfaces:**
- Consumes: `buscarUsuarioAtual()` de `web/lib/data/usuario.js` (Task 1) —
  já retorna `carne_leao_frequencia`/`carne_leao_email`.
- Produces: `atualizarMeusDados` (Server Action, mesma assinatura já
  existente) passa a gravar `carne_leao_frequencia` e `carne_leao_email`
  também.

- [ ] **Step 1: Estender a Server Action**

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

  if (!user) {
    return { error: "Não autorizado." };
  }

  const contatoBruto = formData.get("contato");
  const frequencia = formData.get("carne_leao_frequencia") || null;

  const dados = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || null,
    crp: formData.get("crp") || null,
    contato: contatoBruto ? Number(String(contatoBruto).replace(/\D/g, "")) : null,
    carne_leao_frequencia: frequencia,
    carne_leao_email: formData.get("carne_leao_email") || null,
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

- [ ] **Step 2: Adicionar os campos no formulário**

```jsx
// web/components/MeusDadosForm.js — inserir este bloco logo antes do
// bloco de `{state?.error && ...}` já existente no fim do form
<fieldset className="space-y-3 border-t border-border pt-4">
  <legend className="text-sm font-semibold text-navy px-0">Envio automático por e-mail</legend>
  <div>
    <label htmlFor="carne_leao_frequencia" className="block text-sm font-semibold text-navy">
      Frequência
    </label>
    <select
      id="carne_leao_frequencia"
      name="carne_leao_frequencia"
      defaultValue={usuario?.carne_leao_frequencia ?? ""}
      className="field"
    >
      <option value="">Desativado</option>
      <option value="semanal">Semanal</option>
      <option value="quinzenal">Quinzenal</option>
      <option value="mensal">Mensal</option>
    </select>
  </div>
  <div>
    <label htmlFor="carne_leao_email" className="block text-sm font-semibold text-navy">
      E-mail de destino
    </label>
    <input
      id="carne_leao_email"
      name="carne_leao_email"
      type="email"
      defaultValue={usuario?.carne_leao_email ?? ""}
      className="field"
    />
    <p className="text-xs text-muted mt-1">
      Deixe em branco para usar seu e-mail de login. Pode ser o e-mail do seu contador.
    </p>
  </div>
</fieldset>
```

O bloco completo do arquivo fica com este `<fieldset>` inserido entre o
campo "Celular" e a linha `{state?.error && ...}` já existentes.

- [ ] **Step 3: Rodar eslint**

Run: `cd web && npx eslint lib/actions/usuario.js components/MeusDadosForm.js`
Expected: sem erros.

- [ ] **Step 4: Verificar contra produção (dado descartável)**

Script Node avulso (scratchpad), carregando env de `web/.env.local`
(`export $(grep -v '^#' .env.local | xargs)` antes de rodar), usando o
service-role: ler um usuário existente, guardar
`carne_leao_frequencia`/`carne_leao_email` originais, fazer um `update`
direto simulando o que a Server Action grava (`carne_leao_frequencia:
'semanal', carne_leao_email: 'teste@exemplo.com'`), confirmar a leitura de
volta, e restaurar os valores originais no `finally`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/actions/usuario.js web/components/MeusDadosForm.js
git commit -m "feat: configurar frequencia e email do envio automatico em Meus Dados"
```

---

### Task 3: Extrair `agruparEmLinhas` (DRY entre a geração manual e a automática)

**Files:**
- Modify: `web/lib/carne-leao-txt.js`
- Modify: `web/app/(app)/(gestao)/carne-leao/gerar/route.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `agruparEmLinhas(itens: Item[])` exportada de
  `web/lib/carne-leao-txt.js`, onde `Item` é o formato já retornado por
  `web/lib/data/carne-leao.js` (`{ pagamentoId, valor, dataPagamento,
  dataAtendimento, cpfPagador, cpfBeneficiario, ... }`). Retorna
  `{ dataPagamento, valor, descricao, cpfPagador, cpfBeneficiario }[]` — o
  mesmo formato que `montarArquivoTxt` já espera receber. A Task 5 (rota
  automática) consome esta função diretamente.

- [ ] **Step 1: Adicionar `agruparEmLinhas` em `carne-leao-txt.js`**

```js
// web/lib/carne-leao-txt.js — adicionar depois de `montarDescricao` e
// antes de `montarLinha`

// Agrupa uma lista plana de pagamentos elegíveis em linhas de TXT,
// combinando os que compartilham o mesmo par (cpfPagador, cpfBeneficiario)
// numa única linha (valor somado, data mais recente, descrição combinada).
// Um mesmo pagador pode ter mais de um beneficiário (ex.: dois
// dependentes distintos) — por isso a chave é composta, nunca só o
// cpfPagador.
export function agruparEmLinhas(itens) {
  const porChave = new Map();
  for (const item of itens) {
    const chave = `${item.cpfPagador}|${item.cpfBeneficiario}`;
    const lista = porChave.get(chave) ?? [];
    lista.push(item);
    porChave.set(chave, lista);
  }

  const linhas = [];
  for (const subGrupo of porChave.values()) {
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
  return linhas;
}
```

- [ ] **Step 2: Refatorar a rota manual pra usar a função extraída**

```js
// web/app/(app)/(gestao)/carne-leao/gerar/route.js
import { buscarPagamentosPorIds } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { montarArquivoTxt, agruparEmLinhas, cpfValido } from "@/lib/carne-leao-txt";
import { calcularPeriodo } from "@/lib/periodo-agenda";

export async function POST(request) {
  const formData = await request.formData();
  const mes = formData.get("mes");
  const ano = formData.get("ano");

  if (!/^\d{1,2}$/.test(mes) || !/^\d{4}$/.test(ano)) {
    return new Response("Período inválido.", { status: 400 });
  }

  let grupos;
  try {
    grupos = JSON.parse(formData.get("grupos") || "[]");
  } catch {
    return new Response("Dados de agrupamento inválidos.", { status: 400 });
  }

  const usuario = await buscarUsuarioAtual();
  if (!cpfValido(usuario.cpf)) {
    return new Response("CPF do profissional não cadastrado. Preencha em /configuracoes/conta.", { status: 400 });
  }

  const { inicio: dataInicio, fim: dataFim } = calcularPeriodo("mes", `${ano}-${String(mes).padStart(2, "0")}-01`);

  const todosIds = [...new Set(grupos.flat())];
  const pagamentos = await buscarPagamentosPorIds(todosIds, { dataInicio, dataFim });
  const porId = new Map(pagamentos.map((p) => [p.pagamentoId, p]));

  const linhas = [];
  const idsConsumidos = new Set();
  for (const grupoIds of grupos) {
    // Nunca confia que o client não repetiu o mesmo id em grupos
    // diferentes — um id já usado em um grupo anterior nesta mesma
    // submissão não pode gerar uma segunda linha (senão o pagamento
    // dobra no arquivo declarado).
    const itens = grupoIds
      .filter((id) => !idsConsumidos.has(id))
      .map((id) => porId.get(id))
      .filter(Boolean);
    if (itens.length === 0) continue;

    for (const item of itens) idsConsumidos.add(item.pagamentoId);

    linhas.push(...agruparEmLinhas(itens));
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

`montarDescricao` deixa de ser importada diretamente aqui (só
`agruparEmLinhas` a usa internamente agora) — remover do import se o
eslint acusar import não usado.

- [ ] **Step 3: Rodar eslint**

Run: `cd web && npx eslint lib/carne-leao-txt.js "app/(app)/(gestao)/carne-leao/gerar/route.js"`
Expected: sem erros.

- [ ] **Step 4: Verificar que o comportamento não mudou (script Node puro, sem banco)**

Script Node avulso (scratchpad) importando `agruparEmLinhas` e
`montarArquivoTxt` de `web/lib/carne-leao-txt.js`, com
`console.assert`:

```js
import { agruparEmLinhas, montarArquivoTxt } from "../../web/lib/carne-leao-txt.js"; // ajustar caminho relativo real

// (a) mesmo pagador + mesmo beneficiário → 1 linha, valor somado
const a = agruparEmLinhas([
  { pagamentoId: 1, valor: 100, dataPagamento: "2026-08-05", dataAtendimento: "2026-08-01", cpfPagador: "11111111111", cpfBeneficiario: "11111111111" },
  { pagamentoId: 2, valor: 50, dataPagamento: "2026-08-10", dataAtendimento: "2026-08-08", cpfPagador: "11111111111", cpfBeneficiario: "11111111111" },
]);
console.assert(a.length === 1 && a[0].valor === 150 && a[0].dataPagamento === "2026-08-10", "caso (a) falhou");

// (b) mesmo pagador, beneficiários diferentes → 2 linhas
const b = agruparEmLinhas([
  { pagamentoId: 3, valor: 200, dataPagamento: "2026-08-05", dataAtendimento: "2026-08-01", cpfPagador: "22222222222", cpfBeneficiario: "22222222222" },
  { pagamentoId: 4, valor: 300, dataPagamento: "2026-08-06", dataAtendimento: "2026-08-02", cpfPagador: "22222222222", cpfBeneficiario: "33333333333" },
]);
console.assert(b.length === 2, "caso (b) falhou — deveria separar por beneficiário");

console.log("OK: agruparEmLinhas preserva o comportamento esperado.");
```

Run: `node caminho/do/script.mjs`
Expected: `OK: agruparEmLinhas preserva o comportamento esperado.`, sem
nenhuma linha de `Assertion failed`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/carne-leao-txt.js "web/app/(app)/(gestao)/carne-leao/gerar/route.js"
git commit -m "refactor: extrai agruparEmLinhas de carne-leao/gerar pra reuso na automacao"
```

---

### Task 4: Lógica pura de data/período por frequência

**Files:**
- Create: `web/lib/carne-leao-automacao.js`

**Interfaces:**
- Consumes: nada (função pura, sem I/O).
- Produces:
  - `estaNaData(frequencia: 'semanal'|'quinzenal'|'mensal', ultimoEnvio: string|null, hojeISO: string): boolean`
  - `periodoParaEnvio(frequencia: 'semanal'|'quinzenal'|'mensal', ultimoEnvio: string|null, hojeISO: string): { inicio: string, fim: string }`
  - Ambas consumidas pela Task 5 (a rota automática).

- [ ] **Step 1: Escrever o módulo**

```js
// web/lib/carne-leao-automacao.js
import { calcularPeriodo, deslocarData } from "@/lib/periodo-agenda";

function diaSeguinte(dataISO) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + 1);
  return data.toISOString().slice(0, 10);
}

function diasCorridosDesde(dataISO, hojeISO) {
  const a = new Date(`${dataISO}T00:00:00Z`);
  const b = new Date(`${hojeISO}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

// Decide se um profissional está "na data" de receber um envio
// automático, dada a frequência configurada e a data do último envio
// bem-sucedido. Nunca enviou ainda → sempre está na data (primeira vez).
export function estaNaData(frequencia, ultimoEnvio, hojeISO) {
  if (!ultimoEnvio) return true;

  if (frequencia === "mensal") {
    const [anoUlt, mesUlt] = ultimoEnvio.split("-");
    const [anoHoje, mesHoje, diaHoje] = hojeISO.split("-");
    const mudouDeMes = anoUlt !== anoHoje || mesUlt !== mesHoje;
    // Dá uma margem de 2 dias no início do mês pra pagamentos registrados
    // com atraso nos primeiros dias entrarem no envio do mês anterior.
    return mudouDeMes && Number(diaHoje) >= 3;
  }

  const dias = diasCorridosDesde(ultimoEnvio, hojeISO);
  if (frequencia === "quinzenal") return dias >= 14;
  return dias >= 7; // semanal
}

// Calcula o período (inicio/fim, yyyy-mm-dd) a ser coberto por um envio
// automático. Mensal sempre cobre o mês anterior completo. Semanal e
// quinzenal cobrem o delta desde o último envio, nunca cruzando virada de
// mês (capado no início/fim do mês corrente) — é assim que evitamos
// duplicidade entre envios automáticos sem depender de marcar pagamento
// como "já exportado" (item 10 do backlog, ainda não implementado).
export function periodoParaEnvio(frequencia, ultimoEnvio, hojeISO) {
  if (frequencia === "mensal") {
    const mesAnteriorBase = deslocarData(hojeISO, "mes", -1);
    return calcularPeriodo("mes", mesAnteriorBase);
  }

  const mesCorrente = calcularPeriodo("mes", hojeISO);
  const inicioDelta = ultimoEnvio ? diaSeguinte(ultimoEnvio) : mesCorrente.inicio;
  const inicio = inicioDelta > mesCorrente.inicio ? inicioDelta : mesCorrente.inicio;
  const fim = hojeISO < mesCorrente.fim ? hojeISO : mesCorrente.fim;
  return { inicio, fim };
}
```

- [ ] **Step 2: Rodar eslint**

Run: `cd web && npx eslint lib/carne-leao-automacao.js`
Expected: sem erros.

- [ ] **Step 3: Verificar com script Node puro (sem banco)**

```js
// scratchpad, importando de web/lib/carne-leao-automacao.js e
// web/lib/periodo-agenda.js (caminho relativo real, sem alias "@/")
import { estaNaData, periodoParaEnvio } from "...";

// estaNaData
console.assert(estaNaData("semanal", null, "2026-08-13") === true, "nunca enviou deveria estar na data");
console.assert(estaNaData("semanal", "2026-08-07", "2026-08-13") === false, "6 dias, semanal ainda nao deveria estar na data"); // 6 dias
console.assert(estaNaData("semanal", "2026-08-06", "2026-08-13") === true, "7 dias, semanal deveria estar na data");
console.assert(estaNaData("quinzenal", "2026-08-01", "2026-08-13") === false, "12 dias, quinzenal ainda nao");
console.assert(estaNaData("quinzenal", "2026-07-30", "2026-08-13") === true, "14 dias, quinzenal deveria estar na data");
console.assert(estaNaData("mensal", "2026-08-05", "2026-08-20") === false, "mesmo mes, mensal nao deveria estar na data");
console.assert(estaNaData("mensal", "2026-07-05", "2026-08-02") === false, "mudou de mes mas dia < 3, mensal ainda nao");
console.assert(estaNaData("mensal", "2026-07-05", "2026-08-03") === true, "mudou de mes e dia >= 3, mensal deveria estar na data");

// periodoParaEnvio
const mensal = periodoParaEnvio("mensal", "2026-07-05", "2026-08-03");
console.assert(mensal.inicio === "2026-07-01" && mensal.fim === "2026-07-31", "mensal deveria cobrir julho inteiro");

const semanalMeioDoMes = periodoParaEnvio("semanal", "2026-08-06", "2026-08-13");
console.assert(semanalMeioDoMes.inicio === "2026-08-07" && semanalMeioDoMes.fim === "2026-08-13", "semanal deveria ser o delta desde o dia seguinte ao ultimo envio");

// caso crítico: último envio no mês anterior, não pode vazar pro mês
// anterior nem incluir o mês anterior inteiro por engano
const cruzaMes = periodoParaEnvio("semanal", "2026-07-28", "2026-08-03");
console.assert(cruzaMes.inicio === "2026-08-01" && cruzaMes.fim === "2026-08-03", "delta nao pode cruzar virada de mes");

console.log("OK: todas as asserções de carne-leao-automacao passaram.");
```

Run: `node caminho/do/script.mjs`
Expected: `OK: todas as asserções de carne-leao-automacao passaram.`, sem
nenhuma linha de `Assertion failed`.

- [ ] **Step 4: Commit**

```bash
git add web/lib/carne-leao-automacao.js
git commit -m "feat: logica pura de data/periodo do envio automatico por frequencia"
```

---

### Task 5: Modificar `listarPagamentosElegiveis` pra aceitar client/owner explícitos

**Files:**
- Modify: `web/lib/data/carne-leao.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `listarPagamentosElegiveis({ dataInicio, dataFim }, opcoes?)`
  onde `opcoes` é opcional: `{ supabase?: SupabaseClient, ownerId?:
  string }`. Sem `opcoes` (ou sem `opcoes.supabase`), comportamento
  **idêntico** ao de hoje (client por sessão, RLS implícito). Com
  `opcoes.supabase` fornecido (client service-role), adiciona
  `.eq("Sessao.owner", opcoes.ownerId)` — obrigatório escopar
  manualmente, já que o service-role ignora RLS. Consumida pela Task 6 (a
  rota automática).

- [ ] **Step 1: Modificar a função**

```js
// web/lib/data/carne-leao.js
export async function listarPagamentosElegiveis({ dataInicio, dataFim }, opcoes = {}) {
  const supabase = opcoes.supabase ?? (await createClient());

  let query = supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "recibo")
    .gte("data_pagamento", dataInicio)
    .lte("data_pagamento", dataFim)
    .order("data_pagamento");

  if (opcoes.ownerId) {
    query = query.eq("Sessao.owner", opcoes.ownerId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const resolvidos = normalizarIdsLista(data, ["id"]).map(resolverPagamento);

  return {
    elegiveis: resolvidos.filter(elegivel),
    semCpf: resolvidos.filter((p) => !elegivel(p)),
  };
}
```

(Só essa função muda — `buscarPagamentosPorIds` continua exatamente como
está, ela já não precisa de escopo por owner porque os ids que recebe já
vêm de uma consulta anterior já escopada.)

- [ ] **Step 2: Rodar eslint**

Run: `cd web && npx eslint lib/data/carne-leao.js`
Expected: sem erros.

- [ ] **Step 3: Verificar as duas chamadas contra produção (dado descartável)**

Script Node avulso (scratchpad), com env carregado de `.env.local`:
criar um paciente descartável com `documento: 'recibo'`, `cpf` válido, uma
sessão e um pagamento nesse período, ligados a um `owner` conhecido
(pegar de um `Usuarios` real existente via `id_user`); depois:
1. Chamar `listarPagamentosElegiveis({ dataInicio, dataFim })` (sem
   `opcoes`) usando um client Supabase autenticado como esse usuário (ou,
   se não houver sessão real disponível no script, pular esta chamada e
   documentar como não coberta — é o comportamento já testado no item 8,
   não mudou) — o foco real deste teste é o passo 2.
2. Chamar `listarPagamentosElegiveis({ dataInicio, dataFim }, { supabase:
   createAdminClient(), ownerId: <uuid do dono> })` — confirmar que
   retorna o pagamento descartável em `elegiveis`.
3. Chamar de novo com `ownerId` de **outro** usuário qualquer — confirmar
   que a lista vem vazia (a escopagem manual por owner realmente filtra,
   não é decorativa).
4. Apagar tudo (`PagamentoSessao`, `Sessao`, `Paciente` descartáveis) no
   `finally`, com checagem de erro em cada delete.

- [ ] **Step 4: Commit**

```bash
git add web/lib/data/carne-leao.js
git commit -m "feat: listarPagamentosElegiveis aceita client/owner explicitos p/ uso fora de sessao"
```

---

### Task 6: Endpoint `POST /carne-leao-automatico`

**Files:**
- Create: `web/app/carne-leao-automatico/route.js`
- Modify: `web/lib/supabase/proxy.js`

**Interfaces:**
- Consumes: `listarPagamentosElegiveis` (Task 5), `agruparEmLinhas` e
  `montarArquivoTxt` (Task 3, `web/lib/carne-leao-txt.js`),
  `estaNaData`/`periodoParaEnvio` (Task 4), `createAdminClient` (já
  existente, `web/lib/supabase/admin.js`).
- Produces: endpoint HTTP consumido externamente pelo workflow do n8n
  (fora do escopo deste plano) — contrato: `POST` com header
  `X-Cron-Secret`, sem corpo obrigatório; resposta `200` com JSON
  `{ enviar: [{ email, nomeArquivo, conteudoBase64 }, ...] }` em caso de
  sucesso, `401` se o segredo não bater.

- [ ] **Step 1: Adicionar a rota a `PUBLIC_PATHS`**

```js
// web/lib/supabase/proxy.js — adicionar "/carne-leao-automatico" ao
// array PUBLIC_PATHS já existente, junto dos outros caminhos públicos
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
  "/carne-leao-automatico",
];
```

- [ ] **Step 2: Escrever a rota**

```js
// web/app/carne-leao-automatico/route.js
import { createAdminClient } from "@/lib/supabase/admin";
import { listarPagamentosElegiveis } from "@/lib/data/carne-leao";
import { agruparEmLinhas, montarArquivoTxt, cpfValido } from "@/lib/carne-leao-txt";
import { estaNaData, periodoParaEnvio } from "@/lib/carne-leao-automacao";
import { hojeISO } from "@/lib/periodo-agenda";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.CARNE_LEAO_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const hoje = hojeISO();

  const { data: usuarios, error } = await admin
    .from("Usuarios")
    .select("id, id_user, cpf, crp, carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio")
    .not("carne_leao_frequencia", "is", null);

  if (error) {
    return new Response("Erro ao buscar profissionais configurados.", { status: 500 });
  }

  const enviar = [];

  for (const usuario of usuarios) {
    if (!estaNaData(usuario.carne_leao_frequencia, usuario.carne_leao_ultimo_envio, hoje)) continue;

    if (!cpfValido(usuario.cpf)) {
      await admin.from("EnvioAutomaticoCarneLeao").insert({
        usuario: usuario.id,
        sucesso: false,
        mensagem_erro: "CPF do profissional não cadastrado ou inválido.",
        quantidade_linhas: 0,
      });
      continue;
    }

    const { inicio: dataInicio, fim: dataFim } = periodoParaEnvio(
      usuario.carne_leao_frequencia,
      usuario.carne_leao_ultimo_envio,
      hoje
    );

    const { elegiveis } = await listarPagamentosElegiveis(
      { dataInicio, dataFim },
      { supabase: admin, ownerId: usuario.id_user }
    );

    if (elegiveis.length === 0) {
      // Nada novo desde o último envio — não conta como enviado, não
      // atualiza carne_leao_ultimo_envio nem gera e-mail vazio.
      continue;
    }

    const linhas = agruparEmLinhas(elegiveis);
    const conteudo = montarArquivoTxt(linhas, usuario);

    let email = usuario.carne_leao_email;
    if (!email) {
      const { data: authUser } = await admin.auth.admin.getUserById(usuario.id_user);
      email = authUser?.user?.email ?? null;
    }

    if (!email) {
      await admin.from("EnvioAutomaticoCarneLeao").insert({
        usuario: usuario.id,
        sucesso: false,
        mensagem_erro: "Sem e-mail de destino disponível.",
        quantidade_linhas: linhas.length,
      });
      continue;
    }

    const mesAno = dataFim.slice(0, 7).split("-").reverse().join("-"); // "AAAA-MM" -> "MM-AAAA"
    const nomeArquivo = `carne-leao-${mesAno}.txt`;

    await admin
      .from("Usuarios")
      .update({ carne_leao_ultimo_envio: dataFim })
      .eq("id", usuario.id);

    await admin.from("EnvioAutomaticoCarneLeao").insert({
      usuario: usuario.id,
      sucesso: true,
      quantidade_linhas: linhas.length,
    });

    enviar.push({
      email,
      nomeArquivo,
      conteudoBase64: Buffer.from(conteudo, "utf-8").toString("base64"),
    });
  }

  return Response.json({ enviar });
}
```

- [ ] **Step 3: Rodar eslint**

Run: `cd web && npx eslint app/carne-leao-automatico/route.js lib/supabase/proxy.js`
Expected: sem erros.

- [ ] **Step 4: Verificar contra produção (dado descartável)**

**Não criar um `Usuarios` descartável novo** — não há garantia de que
`id_user` aceita um uuid solto sem um usuário real no Supabase Auth por
trás, e criar+apagar um usuário de Auth de teste é mais risco do que o
necessário aqui. Em vez disso, reaproveitar um profissional **real já
existente** (mesmo padrão já usado com sucesso nas verificações do item
8: ler os campos originais, sobrescrever temporariamente, testar,
restaurar no `finally`):

Script Node avulso (scratchpad) que:
1. Lê o primeiro `Usuarios` existente, guarda os valores originais de
   `carne_leao_frequencia`, `carne_leao_email`, `carne_leao_ultimo_envio`.
2. Sobrescreve temporariamente: `carne_leao_frequencia: 'semanal'`,
   `carne_leao_ultimo_envio: null`, `carne_leao_email:
   'teste-descartavel@exemplo.com'` (evita depender de
   `admin.auth.admin.getUserById` neste teste).
3. Cria um paciente/sessão/pagamento descartáveis vinculados ao `owner`
   desse usuário (mesmo padrão do Step 3 da Task 5), com `data_pagamento`
   dentro do período que `periodoParaEnvio("semanal", null, hoje)`
   calcularia.
4. Replica a sequência da rota linha a linha (não dá pra fazer um `POST`
   HTTP de verdade neste ambiente, sem `next dev` funcionando):
   `estaNaData` (deve retornar `true`, já que `carne_leao_ultimo_envio` é
   `null`), `periodoParaEnvio`, `listarPagamentosElegiveis` com o client
   service-role escopado pro `owner` de teste, `agruparEmLinhas`,
   `montarArquivoTxt` — confirma que o pagamento descartável aparece no
   resultado.
5. Simula a atualização de `carne_leao_ultimo_envio` pra hoje e chama
   `estaNaData` de novo — confirma que agora retorna `false` (não geraria
   de novo o mesmo pagamento no próximo disparo do mesmo dia).
6. Apaga o paciente/sessão/pagamento descartáveis e restaura os 3 campos
   originais do `Usuarios` real no `finally`, com checagem de erro em cada
   delete/update.
7. Testa o guard do segredo separadamente: um script simples confirmando
   que a lógica `segredo !== process.env.CARNE_LEAO_CRON_SECRET` rejeita
   corretamente um valor errado (teste unitário da condição, não precisa
   de banco).

- [ ] **Step 5: Gerar e registrar `CARNE_LEAO_CRON_SECRET`**

Gerar uma string aleatória longa (ex: `node -e
"console.log(require('crypto').randomBytes(32).toString('hex'))"`) e
adicionar como `CARNE_LEAO_CRON_SECRET=<valor>` em `web/.env.local` (já
gitignored). **Não** commitar esse valor — ele também precisa ser
configurado manualmente nas variáveis de ambiente do EasyPanel em
produção, e no nó HTTP do n8n que chama este endpoint (isso é trabalho de
infraestrutura, fora do escopo de código deste plano — documentar como
pendência pro usuário).

- [ ] **Step 6: Commit**

```bash
git add web/app/carne-leao-automatico/route.js web/lib/supabase/proxy.js
git commit -m "feat: endpoint /carne-leao-automatico para o n8n disparar o envio periodico"
```

---

## Fora de escopo deste plano (ver spec)

- Implantar o n8n em si na VPS (EasyPanel) e configurar o workflow (nó de
  Cron diário + nó de e-mail iterando a resposta do endpoint) —
  infraestrutura, não código deste repositório.
- Qualquer UI dentro do app pra visualizar o histórico de
  `EnvioAutomaticoCarneLeao` — a tabela existe pra auditoria futura, sem
  tela nesta entrega.
- Confirmação de entrega do e-mail — só o n8n sabe se o SMTP realmente
  entregou.
