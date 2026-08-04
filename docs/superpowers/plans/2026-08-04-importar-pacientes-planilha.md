# Importação de Pacientes via Planilha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o profissional importar vários pacientes de uma vez a
partir de uma planilha `.xlsx`/`.csv`, escolhendo na tela qual coluna da
planilha corresponde a qual campo do cadastro, com prévia antes de
confirmar e possibilidade de cancelar/desfazer. Junto, adicionar um campo
novo ao cadastro de paciente ("Precisa de recibo") que passa a filtrar a
tela `/recibos`.

**Architecture:** Wizard de 4 passos (upload → consultório → mapear
colunas → prévia) num único client component
(`ImportarPacientesWizard.js`), com parsing da planilha 100% no navegador
via SheetJS (`xlsx`). Só na confirmação os dados já mapeados (strings) vão
pra uma Server Action (`importarPacientes`), que é a única fonte de
verdade da validação/deduplicação e faz o insert em lote. Uma segunda
Server Action (`desfazerImportacao`) permite apagar em lote os pacientes
recém-criados. Nenhuma tabela nova além de uma coluna booleana em
`Paciente`.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions),
Supabase (Postgres + RLS), Tailwind v4, SheetJS (`xlsx`, build da CDN
oficial — ver Global Constraints).

Spec completa: `docs/superpowers/specs/2026-08-04-importar-pacientes-planilha-design.md`.

## Global Constraints

- Este projeto **não tem suíte de testes automatizados** — verificação é
  `npm run build`, consulta SQL direta via `node -e` com `pg`, e teste
  manual no navegador via chrome-devtools MCP (incluindo upload de
  arquivo com `mcp__chrome-devtools__upload_file`). Não introduzir
  framework de testes como efeito colateral desta feature.
- Seguir os padrões já estabelecidos: Server Actions com `"use server"`;
  formulários simples usam `(prevState, formData)` + `useActionState`
  (como `PacienteForm`), mas a Server Action de importação é chamada
  **diretamente** de um handler de clique no client component (não é um
  `<form action>`) porque precisa mandar um array de objetos já mapeados
  e devolver um relatório rico — é uma exceção justificada, deixar
  documentado no código. Data layer em `web/lib/data/*.js` sempre com
  `createClient()` de `@/lib/supabase/server`. Classes CSS existentes
  (`.field`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.card`,
  `.empty-state`, `.page-title`, `.link`, `text-navy`, `text-muted`) — não
  criar classes globais novas.
- **Dependência `xlsx`**: o pacote publicado no registro npm está travado
  na versão `0.18.5`, que tem vulnerabilidades conhecidas já corrigidas
  pela SheetJS nas versões seguintes (só distribuídas pela CDN oficial
  deles, não pelo npm). Instalar via
  `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (não
  `npm install xlsx`) — confirmado nesta sessão que essa é a versão atual
  e que `npm audit` não acusa nada pra ela (os 4 "high" que aparecem no
  projeto são pré-existentes, de `brace-expansion`/`postcss`/`sharp`,
  nada a ver com esta dependência — não mexer neles aqui). Isso também
  resolve a pendência já anotada em
  `docs/backlog-novas-funcionalidades.md` item 5 ("avaliar na hora, dado
  o histórico de vulnerabilidades").
- **Importar o pacote sempre como `import XLSX from "xlsx"` (default
  import)**, nunca `import * as XLSX from "xlsx"` — confirmado
  empiricamente nesta sessão que o namespace import não expõe
  `readFile`/`writeFile` (ficam só no `default`), o que quebraria o
  script de geração da planilha modelo.
- **CSV precisa ser lido como texto, não como ArrayBuffer**: ler `.csv`
  com `arquivo.text()` e `XLSX.read(texto, { type: "string" })`; ler
  `.xlsx` com `arquivo.arrayBuffer()` e `XLSX.read(buffer, { type: "array"
  })`. Confirmado empiricamente que ler CSV como `type: "array"` corrompe
  acentuação UTF-8 (ex.: "João" virava "JoÃ£o"). O separador `;` (comum em
  CSV exportado por Excel em pt-BR) é detectado automaticamente pelo
  parser, sem configuração extra — também confirmado.
- Migration aplicada via o mesmo script inline `node -e` com `pg` já
  usado nas migrations anteriores (não existe Supabase CLI funcional
  neste ambiente).
- Commits em português, um por task.
- Antes de `git push`: pedir confirmação do usuário.

---

### Task 1: Migration — coluna `precisa_recibo`

**Files:**
- Create: `supabase/migrations/20260804000003_add_precisa_recibo_paciente.sql`

**Interfaces:**
- Produces: coluna `public."Paciente".precisa_recibo` (boolean, not null,
  default `false`). Tasks 2, 3, 4, 6 dependem dela.

- [ ] **Step 1: Escrever a migration**

```sql
-- "Precisa de recibo": nem todo paciente precisa de recibo emitido pra
-- cada sessão. Nasce como false (Não) mesmo pra pacientes já existentes —
-- decisão explícita do usuário: /recibos passa a listar só sessões de
-- pacientes marcados como "Sim", então o profissional revisa e marca
-- manualmente quem precisa em vez de a tela já vir cheia por padrão.
alter table public."Paciente"
  add column precisa_recibo boolean not null default false;
```

- [ ] **Step 2: Aplicar a migration no banco real**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const fs = require("fs");
const { Client } = require("pg");
(async () => {
  const sql = fs.readFileSync("supabase/migrations/20260804000003_add_precisa_recibo_paciente.sql", "utf8");
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Migration aplicada com sucesso.");
  } catch (err) {
    await client.query("rollback");
    console.error("ERRO:", err.message);
    process.exitCode = 1;
  }
  await client.end();
})();
'
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar que a coluna existe com o default certo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = $1 and column_name = $2`, ["Paciente", "precisa_recibo"]);
  console.log(JSON.stringify(rows));
  await client.end();
})();
'
```

Expected: uma linha com `data_type: "boolean"`, `is_nullable: "NO"`,
`column_default` contendo `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804000003_add_precisa_recibo_paciente.sql
git commit -m "Migration: coluna precisa_recibo em Paciente"
```

---

### Task 2: Data layer — expor `precisa_recibo` em `buscarPaciente`

**Files:**
- Modify: `web/lib/data/pacientes.js:57-69`

**Interfaces:**
- Consumes: coluna `precisa_recibo` (Task 1).
- Produces: `buscarPaciente(id)` agora retorna também `precisa_recibo`
  (boolean). Consumido pela Task 3 (formulário, tela de edição).

- [ ] **Step 1: Adicionar a coluna ao `select` de `buscarPaciente`**

Trocar:

```js
export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id", "consultorio", "pacote"]);
}
```

por:

```js
export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, precisa_recibo"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id", "consultorio", "pacote"]);
}
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/data/pacientes.js
git commit -m "Data layer: buscarPaciente expõe precisa_recibo"
```

---

### Task 3: Cadastro manual — checkbox "Precisa de recibo"

**Files:**
- Modify: `web/components/PacienteForm.js:145-160`
- Modify: `web/lib/actions/pacientes.js:7-19`

**Interfaces:**
- Consumes: `paciente.precisa_recibo` (Task 2, ao editar).
- Produces: campo de formulário `precisa_recibo` — `dadosDoFormulario`
  passa a incluí-lo em `criarPaciente`/`atualizarPaciente`.

- [ ] **Step 1: Adicionar o checkbox em `PacienteForm.js`**

Trocar:

```js
      <div>
        <label htmlFor="observacoes" className="block text-sm font-semibold text-navy">
          Observações
        </label>
        <textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          defaultValue={paciente?.observacoes}
          className="field"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
```

por:

```js
      <div>
        <label htmlFor="observacoes" className="block text-sm font-semibold text-navy">
          Observações
        </label>
        <textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          defaultValue={paciente?.observacoes}
          className="field"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="precisa_recibo"
          name="precisa_recibo"
          type="checkbox"
          defaultChecked={paciente?.precisa_recibo}
          className="h-4 w-4"
        />
        <label htmlFor="precisa_recibo" className="text-sm font-semibold text-navy">
          Precisa de recibo
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
```

- [ ] **Step 2: Incluir o campo em `dadosDoFormulario`**

Trocar (em `web/lib/actions/pacientes.js`):

```js
function dadosDoFormulario(formData) {
  return {
    nome: formData.get("nome"),
    data_nascimento: formData.get("data_nascimento") || null,
    telefone: formData.get("telefone"),
    email: formData.get("email"),
    endereco: formData.get("endereco") || null,
    consultorio: Number(formData.get("consultorio")),
    pacote: formData.get("pacote") ? Number(formData.get("pacote")) : null,
    valor_sessao: Number(formData.get("valor_sessao")),
    observacoes: formData.get("observacoes") || null,
  };
}
```

por:

```js
function dadosDoFormulario(formData) {
  return {
    nome: formData.get("nome"),
    data_nascimento: formData.get("data_nascimento") || null,
    telefone: formData.get("telefone"),
    email: formData.get("email"),
    endereco: formData.get("endereco") || null,
    consultorio: Number(formData.get("consultorio")),
    pacote: formData.get("pacote") ? Number(formData.get("pacote")) : null,
    valor_sessao: Number(formData.get("valor_sessao")),
    observacoes: formData.get("observacoes") || null,
    precisa_recibo: formData.get("precisa_recibo") === "on",
  };
}
```

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/components/PacienteForm.js web/lib/actions/pacientes.js
git commit -m "Cadastro de paciente: checkbox Precisa de recibo"
```

---

### Task 4: `/recibos` — filtrar por `precisa_recibo`

**Files:**
- Modify: `web/lib/data/recibos.js:4-17`

**Interfaces:**
- Consumes: coluna `precisa_recibo` (Task 1).
- Produces: `listarSessoesElegiveisParaRecibo()` só retorna sessões de
  pacientes com `precisa_recibo = true`.

- [ ] **Step 1: Ajustar o select e adicionar o filtro**

Trocar:

```js
export async function listarSessoesElegiveisParaRecibo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, Paciente!inner(id, nome), Recibo(id)")
    .eq("Realizado", true)
    .order("data", { ascending: false });

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.Recibo?.length ?? 0) === 0)
    .map((s) => normalizarIds({ id: s.id, data: s.data, horario: s.horario, paciente_nome: s.Paciente.nome }, ["id"]));
}
```

por:

```js
export async function listarSessoesElegiveisParaRecibo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select("id, data, horario, Paciente!inner(id, nome, precisa_recibo), Recibo(id)")
    .eq("Realizado", true)
    .eq("Paciente.precisa_recibo", true)
    .order("data", { ascending: false });

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.Recibo?.length ?? 0) === 0)
    .map((s) => normalizarIds({ id: s.id, data: s.data, horario: s.horario, paciente_nome: s.Paciente.nome }, ["id"]));
}
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/data/recibos.js
git commit -m "/recibos: filtra por Paciente.precisa_recibo = true"
```

(Comportamento real — tela vazia até marcar pacientes — verificado na
Task 8, junto com o resto do fluxo.)

---

### Task 5: Dependência `xlsx` + planilha modelo estática

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`
- Create: `web/scripts/gerar-planilha-modelo-pacientes.mjs`
- Create: `web/public/planilha-modelo-pacientes.xlsx` (binário, gerado
  pelo script — não escrever à mão)

**Interfaces:**
- Produces: pacote `xlsx` disponível em `web/node_modules` (consumido
  pelas Tasks 6 e 7); arquivo estático
  `web/public/planilha-modelo-pacientes.xlsx`, servido em
  `/planilha-modelo-pacientes.xlsx` (consumido pela Task 7, link "Baixar
  planilha modelo").

- [ ] **Step 1: Instalar o `xlsx` a partir da CDN oficial da SheetJS**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Expected: `package.json` ganha `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`
em `dependencies`. `npm audit` não deve acusar nada pra `xlsx`
especificamente (os "high" pré-existentes de `brace-expansion`/
`postcss`/`sharp` não são desta task, não mexer).

- [ ] **Step 2: Criar o script gerador**

```js
// web/scripts/gerar-planilha-modelo-pacientes.mjs
//
// Gera a planilha modelo estática servida em
// /planilha-modelo-pacientes.xlsx. Rodar de novo só se as colunas do
// mapeamento de importação mudarem — não é executado em runtime.
import { fileURLToPath } from "node:url";
import path from "node:path";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destino = path.resolve(__dirname, "../public/planilha-modelo-pacientes.xlsx");

const cabecalho = [
  "Nome",
  "Data de Nascimento",
  "Telefone",
  "E-mail",
  "Endereço",
  "Valor da Sessão",
  "Observações",
  "Precisa de recibo",
];

const exemplo = [
  "Maria da Silva",
  "15/03/1990",
  "(11) 91234-5678",
  "maria.silva@email.com",
  "Rua das Flores, 123 - São Paulo/SP",
  "150",
  "Paciente encaminhada pelo Dr. João",
  "Sim",
];

const planilha = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
planilha["!cols"] = cabecalho.map(() => ({ wch: 24 }));

const livro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(livro, planilha, "Pacientes");

XLSX.writeFile(livro, destino);
console.log(`Planilha modelo gerada em ${destino}`);
```

- [ ] **Step 3: Rodar o script e verificar o resultado**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node scripts/gerar-planilha-modelo-pacientes.mjs
```

Expected: `Planilha modelo gerada em .../web/public/planilha-modelo-pacientes.xlsx`.

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node -e '
import("xlsx").then(({ default: XLSX }) => {
  const wb = XLSX.readFile("public/planilha-modelo-pacientes.xlsx");
  const aba = wb.Sheets[wb.SheetNames[0]];
  console.log(JSON.stringify(XLSX.utils.sheet_to_json(aba, { header: 1 })));
});
'
```

Expected: array com o cabeçalho e a linha de exemplo, nas 8 colunas
definidas no Step 2.

- [ ] **Step 4: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/scripts/gerar-planilha-modelo-pacientes.mjs web/public/planilha-modelo-pacientes.xlsx
git commit -m "Adiciona dependência xlsx (SheetJS CDN) + planilha modelo de importação"
```

---

### Task 6: Server Actions — `importarPacientes` e `desfazerImportacao`

**Files:**
- Create: `web/lib/actions/importar-pacientes.js`

**Interfaces:**
- Consumes: coluna `precisa_recibo` (Task 1); tabela `Paciente` (RLS já
  escopa por `owner = auth.uid()`).
- Produces:
  - `importarPacientes(consultorioId: number, linhas: Array<{numeroLinha:
    number, nome: string, data_nascimento: string, telefone: string,
    email: string, endereco: string, valor_sessao: string, observacoes:
    string, precisa_recibo: string}>) => Promise<{totalLinhas: number,
    importados: number, idsInseridos: number[], puladosSemNome: number,
    puladosDuplicados: Array<{linha: number, nome: string}>, avisos:
    Array<{linha: number, nome: string, campo: string, motivo:
    string}>}>` — todo campo de `linhas[i]` é string (já convertida pelo
    client, ver Task 7); campos vazios são `""`, não `null`/`undefined`.
  - `desfazerImportacao(ids: number[]) => Promise<void>`.
  - Ambas consumidas pela Task 7 (`ImportarPacientesWizard`).

- [ ] **Step 1: Criar o arquivo com as duas Server Actions**

```js
// web/lib/actions/importar-pacientes.js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Chamadas diretamente do client component (não são <form action>): o
// wizard manda um array de linhas já mapeadas e precisa de volta um
// relatório rico, não o par {error}/{mensagem} usado pelos formulários
// com useActionState.

function normalizarNome(nome) {
  return (nome ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parsearData(texto) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((texto ?? "").trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function parsearValor(texto) {
  const limpo = (texto ?? "").trim().replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero;
}

function parsearRecibo(texto) {
  const normalizado = (texto ?? "").trim().toLowerCase();
  return ["sim", "yes", "true", "1"].includes(normalizado);
}

export async function importarPacientes(consultorioId, linhas) {
  const supabase = await createClient();

  const { data: existentes, error: erroExistentes } = await supabase.from("Paciente").select("nome");
  if (erroExistentes) throw new Error(erroExistentes.message);

  const nomesExistentes = new Set(existentes.map((p) => normalizarNome(p.nome)));
  const nomesNestaImportacao = new Set();

  const candidatos = [];
  const relatorio = {
    totalLinhas: linhas.length,
    importados: 0,
    idsInseridos: [],
    puladosSemNome: 0,
    puladosDuplicados: [],
    avisos: [],
  };

  for (const linha of linhas) {
    const nome = (linha.nome ?? "").trim();
    const numeroLinha = linha.numeroLinha;

    if (!nome) {
      relatorio.puladosSemNome += 1;
      continue;
    }

    const nomeNormalizado = normalizarNome(nome);
    if (nomesExistentes.has(nomeNormalizado) || nomesNestaImportacao.has(nomeNormalizado)) {
      relatorio.puladosDuplicados.push({ linha: numeroLinha, nome });
      continue;
    }
    nomesNestaImportacao.add(nomeNormalizado);

    const dataNascimento = parsearData(linha.data_nascimento);
    if (linha.data_nascimento && !dataNascimento) {
      relatorio.avisos.push({
        linha: numeroLinha,
        nome,
        campo: "Data de Nascimento",
        motivo: "formato inválido, campo deixado em branco",
      });
    }

    const valorSessao = parsearValor(linha.valor_sessao);
    if (linha.valor_sessao && valorSessao === null) {
      relatorio.avisos.push({
        linha: numeroLinha,
        nome,
        campo: "Valor da Sessão",
        motivo: "formato inválido, campo deixado em branco",
      });
    }

    candidatos.push({
      nome,
      data_nascimento: dataNascimento,
      telefone: (linha.telefone ?? "").trim() || null,
      email: (linha.email ?? "").trim() || null,
      endereco: (linha.endereco ?? "").trim() || null,
      valor_sessao: valorSessao,
      observacoes: (linha.observacoes ?? "").trim() || null,
      precisa_recibo: parsearRecibo(linha.precisa_recibo),
      consultorio: consultorioId,
      pacote: null,
    });
  }

  if (candidatos.length > 0) {
    const { data: inseridos, error } = await supabase.from("Paciente").insert(candidatos).select("id");
    if (error) throw new Error(error.message);
    relatorio.importados = inseridos.length;
    relatorio.idsInseridos = inseridos.map((p) => Number(p.id));
  }

  revalidatePath("/pacientes");
  return relatorio;
}

export async function desfazerImportacao(ids) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").delete().in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/pacientes");
}
```

**Nota sobre segurança:** `desfazerImportacao` não precisa checar posse
dos `ids` recebidos — a RLS de `Paciente` já restringe qualquer
`delete`/`select`/`insert` a linhas com `owner = auth.uid()`, então mesmo
que os IDs fossem adulterados no client, só apaga pacientes do próprio
profissional autenticado.

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/actions/importar-pacientes.js
git commit -m "Server Actions: importarPacientes e desfazerImportacao"
```

---

### Task 7: Wizard de importação — botão, página e componente

**Files:**
- Create: `web/components/ImportarPacientesWizard.js`
- Create: `web/app/(app)/pacientes/importar/page.js`
- Modify: `web/app/(app)/pacientes/page.js:8-15`

**Interfaces:**
- Consumes: `importarPacientes`/`desfazerImportacao` (Task 6);
  `listarConsultorios()` (já existente, `web/lib/data/consultorios.js`);
  planilha modelo em `/planilha-modelo-pacientes.xlsx` (Task 5).
- Produces: rota `/pacientes/importar`; botão "Importar planilha" em
  `/pacientes`.

- [ ] **Step 1: Criar `web/components/ImportarPacientesWizard.js`**

```js
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import XLSX from "xlsx";
import { importarPacientes, desfazerImportacao } from "@/lib/actions/importar-pacientes";

const CAMPOS = [
  { chave: "nome", rotulo: "Nome", obrigatorio: true, aliases: ["nome"] },
  {
    chave: "data_nascimento",
    rotulo: "Data de Nascimento",
    obrigatorio: false,
    aliases: ["data de nascimento", "data nascimento", "nascimento"],
  },
  { chave: "telefone", rotulo: "Telefone", obrigatorio: false, aliases: ["telefone", "celular", "whatsapp"] },
  { chave: "email", rotulo: "E-mail", obrigatorio: false, aliases: ["e-mail", "email"] },
  { chave: "endereco", rotulo: "Endereço", obrigatorio: false, aliases: ["endereco", "endereço"] },
  {
    chave: "valor_sessao",
    rotulo: "Valor da Sessão",
    obrigatorio: false,
    aliases: ["valor da sessao", "valor da sessão", "valor"],
  },
  {
    chave: "observacoes",
    rotulo: "Observações",
    obrigatorio: false,
    aliases: ["observacoes", "observações", "observacao"],
  },
  {
    chave: "precisa_recibo",
    rotulo: "Precisa de recibo",
    obrigatorio: false,
    aliases: ["precisa de recibo", "recibo"],
  },
];

function semAcentos(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectarMapeamentoInicial(cabecalhos) {
  const mapeamento = {};
  for (const campo of CAMPOS) {
    const indice = cabecalhos.findIndex((cabecalho) => campo.aliases.includes(semAcentos(String(cabecalho))));
    mapeamento[campo.chave] = indice >= 0 ? indice : "";
  }
  return mapeamento;
}

function celulaParaTexto(valor) {
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}/${valor.getFullYear()}`;
  }
  return String(valor ?? "").trim();
}

async function parsearArquivo(arquivo) {
  const nomeArquivo = arquivo.name.toLowerCase();
  let workbook;

  if (nomeArquivo.endsWith(".csv")) {
    const texto = await arquivo.text();
    workbook = XLSX.read(texto, { type: "string", cellDates: true });
  } else {
    const buffer = await arquivo.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  }

  const aba = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: "" });
  if (linhas.length === 0) throw new Error("A planilha está vazia.");

  const [cabecalhos, ...resto] = linhas;
  const linhasComDados = resto
    .map((linha, indice) => ({ linha, numeroLinha: indice + 2 }))
    .filter(({ linha }) => linha.some((celula) => String(celula ?? "").trim() !== ""));

  if (linhasComDados.length === 0) {
    throw new Error("Nenhuma linha com dados encontrada na planilha.");
  }

  return {
    cabecalhos: cabecalhos.map((c) => String(c ?? "").trim()),
    linhas: linhasComDados,
  };
}

export default function ImportarPacientesWizard({ consultorios }) {
  const [passo, setPasso] = useState(1);
  const [erro, setErro] = useState("");
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [cabecalhos, setCabecalhos] = useState([]);
  const [linhasBrutas, setLinhasBrutas] = useState([]);
  const [consultorioId, setConsultorioId] = useState(consultorios[0]?.id ?? "");
  const [mapeamento, setMapeamento] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const linhasMapeadas = useMemo(() => {
    return linhasBrutas.map(({ linha, numeroLinha }) => {
      const objeto = { numeroLinha };
      for (const campo of CAMPOS) {
        const indice = mapeamento[campo.chave];
        objeto[campo.chave] = indice === "" || indice === undefined ? "" : celulaParaTexto(linha[indice]);
      }
      return objeto;
    });
  }, [linhasBrutas, mapeamento]);

  async function aoSelecionarArquivo(event) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setErro("");
    setCarregandoArquivo(true);
    try {
      const { cabecalhos: cabecalhosLidos, linhas } = await parsearArquivo(arquivo);
      setCabecalhos(cabecalhosLidos);
      setLinhasBrutas(linhas);
      setMapeamento(detectarMapeamentoInicial(cabecalhosLidos));
      setNomeArquivo(arquivo.name);
    } catch (erroLeitura) {
      setErro(`Não foi possível ler o arquivo: ${erroLeitura.message}`);
      setCabecalhos([]);
      setLinhasBrutas([]);
      setNomeArquivo("");
    } finally {
      setCarregandoArquivo(false);
    }
  }

  async function aoConfirmar() {
    setEnviando(true);
    setErro("");
    try {
      const relatorio = await importarPacientes(Number(consultorioId), linhasMapeadas);
      setResultado(relatorio);
    } catch (erroImportacao) {
      setErro(`Não foi possível importar: ${erroImportacao.message}`);
    } finally {
      setEnviando(false);
    }
  }

  async function aoDesfazer() {
    setEnviando(true);
    try {
      await desfazerImportacao(resultado.idsInseridos);
      setResultado({ ...resultado, desfeito: true });
    } catch (erroDesfazer) {
      setErro(`Não foi possível desfazer: ${erroDesfazer.message}`);
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="max-w-2xl space-y-4 card p-6">
        <h2 className="text-lg font-bold text-navy">Resultado da importação</h2>

        {resultado.desfeito ? (
          <p className="text-sm font-semibold text-navy">
            Importação desfeita — nenhum paciente desta leva foi mantido.
          </p>
        ) : (
          <ul className="text-sm text-navy space-y-1">
            <li>Total de linhas na planilha: {resultado.totalLinhas}</li>
            <li className="font-semibold">Pacientes importados: {resultado.importados}</li>
            <li>Puladas por falta de nome: {resultado.puladosSemNome}</li>
            <li>Puladas por já existirem (duplicadas): {resultado.puladosDuplicados.length}</li>
          </ul>
        )}

        {!resultado.desfeito && resultado.puladosDuplicados.length > 0 && (
          <div className="text-sm text-muted">
            <p className="font-semibold text-navy">Duplicadas:</p>
            <ul className="list-disc list-inside">
              {resultado.puladosDuplicados.map((item) => (
                <li key={`${item.linha}-${item.nome}`}>
                  Linha {item.linha}: {item.nome}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!resultado.desfeito && resultado.avisos.length > 0 && (
          <div className="text-sm text-muted">
            <p className="font-semibold text-navy">Avisos:</p>
            <ul className="list-disc list-inside">
              {resultado.avisos.map((item, indice) => (
                <li key={`${item.linha}-${item.campo}-${indice}`}>
                  Linha {item.linha} ({item.nome}): {item.campo} — {item.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex gap-3">
          <Link href="/pacientes" className="btn-primary">
            Voltar para pacientes
          </Link>
          {!resultado.desfeito && resultado.importados > 0 && (
            <button
              type="button"
              onClick={aoDesfazer}
              disabled={enviando}
              className="btn-danger disabled:opacity-50"
            >
              {enviando ? "Desfazendo..." : "Desfazer importação"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2 text-sm text-muted">
        <span className={passo === 1 ? "font-bold text-navy" : ""}>1. Upload</span>
        <span>›</span>
        <span className={passo === 2 ? "font-bold text-navy" : ""}>2. Consultório</span>
        <span>›</span>
        <span className={passo === 3 ? "font-bold text-navy" : ""}>3. Mapear colunas</span>
        <span>›</span>
        <span className={passo === 4 ? "font-bold text-navy" : ""}>4. Prévia</span>
      </div>

      {passo === 1 && (
        <div className="card p-6 space-y-4">
          <div>
            <label htmlFor="arquivo" className="block text-sm font-semibold text-navy">
              Selecione a planilha (.xlsx ou .csv)
            </label>
            <input id="arquivo" type="file" accept=".xlsx,.csv" onChange={aoSelecionarArquivo} className="field" />
          </div>

          <a href="/planilha-modelo-pacientes.xlsx" download className="link text-sm">
            Baixar planilha modelo
          </a>

          {carregandoArquivo && <p className="text-sm text-muted">Lendo arquivo...</p>}
          {erro && <p className="text-sm text-red-600">{erro}</p>}

          {nomeArquivo && !carregandoArquivo && !erro && (
            <p className="text-sm text-navy">
              <strong>{nomeArquivo}</strong>: {cabecalhos.length} coluna(s) e {linhasBrutas.length} linha(s)
              detectadas.
            </p>
          )}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button
              type="button"
              disabled={linhasBrutas.length === 0}
              onClick={() => setPasso(2)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="card p-6 space-y-4">
          <div>
            <label htmlFor="consultorio" className="block text-sm font-semibold text-navy">
              Consultório (aplicado a todos os pacientes desta importação)
            </label>
            <select
              id="consultorio"
              value={consultorioId}
              onChange={(event) => setConsultorioId(event.target.value)}
              className="field"
            >
              {consultorios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(1)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={!consultorioId}
              onClick={() => setPasso(3)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Escolha qual coluna da planilha corresponde a cada campo do cadastro. Nome é obrigatório; os demais
            podem ficar como "Nenhuma".
          </p>

          {CAMPOS.map((campo) => (
            <div key={campo.chave}>
              <label htmlFor={`mapa-${campo.chave}`} className="block text-sm font-semibold text-navy">
                {campo.rotulo}
                {campo.obrigatorio ? " *" : ""}
              </label>
              <select
                id={`mapa-${campo.chave}`}
                value={mapeamento[campo.chave] ?? ""}
                onChange={(event) =>
                  setMapeamento((atual) => ({
                    ...atual,
                    [campo.chave]: event.target.value === "" ? "" : Number(event.target.value),
                  }))
                }
                className="field"
              >
                <option value="">Nenhuma</option>
                {cabecalhos.map((cabecalho, indice) => (
                  <option key={indice} value={indice}>
                    {cabecalho || `Coluna ${indice + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(2)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={mapeamento.nome === "" || mapeamento.nome === undefined}
              onClick={() => setPasso(4)}
              className="btn-primary disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="card p-6 space-y-4">
          <p className="text-sm text-muted">
            Prévia de {linhasMapeadas.length} paciente(s) que serão importados no consultório selecionado.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-navy font-semibold">
                  {CAMPOS.map((campo) => (
                    <th key={campo.chave} className="px-2 py-1 whitespace-nowrap">
                      {campo.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasMapeadas.map((linha) => (
                  <tr key={linha.numeroLinha} className="border-t border-[var(--color-border)]">
                    {CAMPOS.map((campo) => (
                      <td key={campo.chave} className="px-2 py-1 whitespace-nowrap">
                        {linha[campo.chave] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex gap-3">
            <Link href="/pacientes" className="btn-outline">
              Cancelar
            </Link>
            <button type="button" onClick={() => setPasso(3)} className="btn-outline">
              Voltar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={aoConfirmar}
              className="btn-primary disabled:opacity-50"
            >
              {enviando ? "Importando..." : "Confirmar importação"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `web/app/(app)/pacientes/importar/page.js`**

```js
import ImportarPacientesWizard from "@/components/ImportarPacientesWizard";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaImportarPacientes() {
  const consultorios = await listarConsultorios();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Importar Pacientes</h1>
      <ImportarPacientesWizard consultorios={consultorios} />
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o botão "Importar planilha" em `/pacientes`**

Trocar (em `web/app/(app)/pacientes/page.js`):

```js
      <div className="flex items-center justify-between">
        <h1 className="page-title">Pacientes</h1>
        <Link href="/pacientes/novo" className="btn-primary">
          Novo Paciente
        </Link>
      </div>
```

por:

```js
      <div className="flex items-center justify-between">
        <h1 className="page-title">Pacientes</h1>
        <div className="flex gap-3">
          <Link href="/pacientes/importar" className="btn-outline">
            Importar planilha
          </Link>
          <Link href="/pacientes/novo" className="btn-primary">
            Novo Paciente
          </Link>
        </div>
      </div>
```

- [ ] **Step 4: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -30
```

Expected: build sem erro, rota `/pacientes/importar` listada.

- [ ] **Step 5: Commit**

```bash
git add web/components/ImportarPacientesWizard.js "web/app/(app)/pacientes/importar/page.js" "web/app/(app)/pacientes/page.js"
git commit -m "Wizard de importação de pacientes: upload, mapeamento, prévia e confirmação"
```

(Teste completo no navegador — upload real, mapeamento, prévia, confirmar,
desfazer, cancelar — na Task 8, com dado de teste preparado ali.)

---

### Task 8: Verificação end-to-end completa + push

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Build completo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -60
```

Expected: build sem erro; rotas `/pacientes`, `/pacientes/importar`,
`/pacientes/novo`, `/pacientes/[id]`, `/pacientes/[id]/editar`, `/recibos`
todas listadas.

- [ ] **Step 2: Gerar uma planilha de teste com os quatro cenários do relatório**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && node -e '
import("xlsx").then(({ default: XLSX }) => {
  const cabecalho = ["Nome", "Data de Nascimento", "Telefone", "E-mail", "Endereço", "Valor da Sessão", "Observações", "Precisa de recibo"];
  const linhas = [
    cabecalho,
    ["Paciente Teste Importacao Um", "15/03/1990", "11999990000", "um@teste.com", "Rua A, 1", "150", "linha valida", "Sim"],
    ["", "10/01/1980", "", "", "", "", "linha sem nome", "Nao"],
    ["Paciente Teste Importacao Um", "01/01/1980", "", "", "", "", "duplicada do nome acima", "Nao"],
    ["Paciente Teste Importacao Dois", "data-invalida", "", "", "", "200", "data quebrada mas importa", "Nao"],
  ];
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Teste");
  XLSX.writeFile(livro, "planilha-teste-importacao.xlsx");
  console.log("gerado: planilha-teste-importacao.xlsx");
});
'
```

Expected (resultado esperado ao importar essa planilha, pra conferir no
Step 4): `totalLinhas: 4`, `importados: 2` (Um e Dois),
`puladosSemNome: 1`, `puladosDuplicados: 1`, `avisos: 1` (data de "Paciente
Teste Importacao Dois").

- [ ] **Step 3: Subir o servidor de desenvolvimento**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

- [ ] **Step 4: Teste completo no navegador (chrome-devtools MCP)**

1. Login como um profissional de teste existente, ir em `/pacientes`.
2. Clicar em "Importar planilha" → confirmar que vai pra
   `/pacientes/importar`.
3. Clicar em "Baixar planilha modelo" → confirmar que baixa um `.xlsx`
   com as 8 colunas esperadas.
4. Usar `mcp__chrome-devtools__upload_file` pra selecionar
   `web/planilha-teste-importacao.xlsx` (gerada no Step 2) no input de
   arquivo → confirmar que aparece "8 coluna(s) e 4 linha(s) detectadas"
   (a linha sem nome também conta aqui, só é descartada na confirmação,
   não no parsing).
5. Clicar "Avançar", escolher um consultório de teste, "Avançar".
6. No passo de mapeamento, confirmar que os dropdowns já vieram
   pré-selecionados corretamente (cabeçalhos batem exatamente com os
   nomes dos campos) — clicar "Avançar".
7. Na prévia, confirmar que a tabela mostra as 4 linhas com os valores
   esperados (incluindo a linha com nome vazio mostrando "—").
8. Clicar "Confirmar importação" → confirmar que a tela de resultado
   mostra: Total de linhas: 4, Pacientes importados: 2, Puladas por
   falta de nome: 1, Puladas por já existirem: 1, e um aviso sobre "Data
   de Nascimento" na linha do "Paciente Teste Importacao Dois".
9. Ir em `/pacientes` (outra aba ou depois) e confirmar que "Paciente
   Teste Importacao Um" e "Paciente Teste Importacao Dois" aparecem na
   lista.
10. Voltar pra tela de resultado (ou repetir uma importação de teste
    pequena) e clicar "Desfazer importação" → confirmar mensagem
    "Importação desfeita" e que o botão some. Conferir em `/pacientes`
    que os dois pacientes de teste não aparecem mais.
11. Entrar de novo em `/pacientes/importar`, subir qualquer arquivo, e
    clicar "Cancelar" num dos 3 primeiros passos → confirmar que volta
    pra `/pacientes` sem criar nada.
12. Editar manualmente um paciente qualquer em `/pacientes/[id]/editar`,
    marcar o checkbox "Precisa de recibo", salvar, reabrir a edição e
    confirmar que o checkbox continua marcado.
13. Ir em `/recibos` e confirmar que só aparecem sessões de pacientes com
    "Precisa de recibo" marcado (sessões de pacientes sem o checkbox
    marcado não devem aparecer na lista de "Sessões elegíveis").

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && rm -f planilha-teste-importacao.xlsx
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 5: Pedir confirmação do usuário antes de `git push`**

Mesma regra já estabelecida no projeto: sempre confirmar com o usuário
antes de `git push` e lembrar de clicar em "Deploy" manualmente no
EasyPanel depois (não reimplanta sozinho a partir de um push).

---

### Task 9: Atualizar documentação do backlog

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/backlog-novas-funcionalidades.md`
- Modify: `docs/status-implementacao.md`

**Interfaces:** nenhuma — task de documentação.

- [ ] **Step 1: Mover o item 5 de `docs/backlog.md` pra "Implementado"**

Trocar:

```markdown
## Implementado

| Item | Descrição | Data | Observações |
| --- | --- | --- | --- |
| 1 | Blog de psicologia e saúde mental (`/blog`, `blog.psifacil.com.br`, CRUD `/admin/artigos`) | 2026-08-03 | CRUD ainda não testado clicando no formulário do navegador |
| 3 | Painel administrativo + cadastro de profissionais (convite + autocadastro) | 2026-08-03 (convite) / 2026-08-04 (autocadastro) | Fluxo de convite ainda não verificado ponta a ponta em produção; sem gate funcional por `aprovado` (depende do item 2) |
| 4 | Landing page para tráfego pago — Google Ads (`comece.psifacil.com.br`) | 2026-08-04 | Testado local via chrome-devtools MCP; ainda não está no ar (faltam DNS + domínio no EasyPanel) |

## A realizar

| Item | Descrição | Depende de |
| --- | --- | --- |
| 1b | Papel de "criador de conteúdo" separado de admin (evolução pedida do item 1) | — |
| Item 3 (moderação/aprovação) |
| 5 | Importar pacientes via planilha Excel, com tela de mapeamento de colunas | — |
```

por:

```markdown
## Implementado

| Item | Descrição | Data | Observações |
| --- | --- | --- | --- |
| 1 | Blog de psicologia e saúde mental (`/blog`, `blog.psifacil.com.br`, CRUD `/admin/artigos`) | 2026-08-03 | CRUD ainda não testado clicando no formulário do navegador |
| 3 | Painel administrativo + cadastro de profissionais (convite + autocadastro) | 2026-08-03 (convite) / 2026-08-04 (autocadastro) | Fluxo de convite ainda não verificado ponta a ponta em produção; sem gate funcional por `aprovado` (depende do item 2) |
| 4 | Landing page para tráfego pago — Google Ads (`comece.psifacil.com.br`) | 2026-08-04 | Testado local via chrome-devtools MCP; ainda não está no ar (faltam DNS + domínio no EasyPanel) |
| 5 | Importar pacientes via planilha Excel, com tela de mapeamento de colunas | 2026-08-04 | Inclui também o campo "Precisa de recibo" no cadastro de paciente (fora do escopo original do item, surgiu na mesma sessão) e o filtro correspondente em `/recibos` |

## A realizar

| Item | Descrição | Depende de |
| --- | --- | --- |
| 1b | Papel de "criador de conteúdo" separado de admin (evolução pedida do item 1) | — |
| Item 3 (moderação/aprovação) |
```

- [ ] **Step 2: Marcar o item 5 como implementado em `docs/backlog-novas-funcionalidades.md`**

Trocar a linha de abertura do item 5:

```markdown
## 5. Importar pacientes via planilha Excel

**Objetivo:** deixar o psicólogo trazer sua base de pacientes existente (de
```

por:

```markdown
## 5. Importar pacientes via planilha Excel

**Status: implementado** (2026-08-04) — wizard em `/pacientes/importar`
(upload `.xlsx`/`.csv`, mapeamento de colunas, prévia, confirmação),
planilha modelo pra download, deduplicação por nome e relatório de
linhas puladas/avisos, com opção de cancelar antes de confirmar e
desfazer a leva inteira depois. Detalhes:
`docs/superpowers/specs/2026-08-04-importar-pacientes-planilha-design.md`.
Biblioteca de parse escolhida: `xlsx` (SheetJS), instalada a partir da
CDN oficial deles (não do registro npm, que está travado numa versão com
vulnerabilidades já corrigidas).

**Objetivo:** deixar o psicólogo trazer sua base de pacientes existente (de
```

- [ ] **Step 3: Adicionar seção nova no topo de `docs/status-implementacao.md`**

Adicionar logo depois do título e da linha `Última atualização:`
(atualizar a data também), antes da seção mais recente existente:

```markdown
## Importação de pacientes via planilha + campo "Precisa de recibo" (2026-08-04)

Item 5 do backlog. Wizard em `/pacientes/importar`: upload `.xlsx`/`.csv`
→ escolher consultório → mapear colunas da planilha pros campos do
cadastro (com auto-detecção quando o cabeçalho bate) → prévia → confirmar.
Parsing 100% no navegador (SheetJS `xlsx`, instalado via CDN oficial da
SheetJS por causa de vulnerabilidades já corrigidas na versão travada no
registro npm). A Server Action `importarPacientes` valida e deduplica por
nome (contra pacientes já cadastrados e dentro da própria planilha),
pulando linhas sem nome ou duplicadas e deixando em branco campos de
data/valor em formato inválido — tudo reportado na tela de resultado.
`desfazerImportacao` apaga em lote os pacientes daquela leva específica,
se o profissional perceber algo errado depois de confirmar.

Junto, campo novo `Paciente.precisa_recibo` (nasce como `false` mesmo
pra pacientes já existentes, decisão explícita do usuário), editável no
cadastro manual e na planilha, que agora filtra `/recibos` — só sessões
de pacientes marcados como "Sim" aparecem como elegíveis.
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/backlog-novas-funcionalidades.md docs/status-implementacao.md
git commit -m "docs: marca item 5 (importação de pacientes) como implementado"
```

---

## Self-Review

- **Cobertura da spec:** botão + página dedicada (Task 7), upload
  `.xlsx`/`.csv` (Task 7), consultório único pro lote (Task 7 passo 2),
  mapeamento de colunas com auto-detecção (Task 7 passo 3), prévia da
  planilha inteira (Task 7 passo 4), validação/dedup/relatório na Server
  Action (Task 6), planilha modelo (Task 5), campo "Precisa de recibo" +
  filtro em `/recibos` (Tasks 1-4), cancelar nos passos 1-3 e desfazer
  depois de confirmar (Task 7) — todas as seções do design de
  `2026-08-04-importar-pacientes-planilha-design.md` têm task
  correspondente.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo step tem
  código completo ou comando exato. As três armadilhas técnicas
  descobertas nesta sessão (namespace import do `xlsx` não expõe
  `readFile`/`writeFile`; CSV como ArrayBuffer corrompe UTF-8; pacote
  `xlsx` do npm registry desatualizado/vulnerável) foram verificadas
  empiricamente e já vêm resolvidas no código das tasks, não deixadas
  como risco.
- **Consistência de tipos/nomes:** `linhas[i]` tem sempre as chaves
  `numeroLinha, nome, data_nascimento, telefone, email, endereco,
  valor_sessao, observacoes, precisa_recibo` — mesmas chaves usadas na
  Task 7 (`linhasMapeadas`, client) e na Task 6 (`importarPacientes`,
  server); `idsInseridos` (Task 6) é o mesmo campo lido em `aoDesfazer`
  (Task 7); `consultorioId` é `Number(...)` antes de chamar
  `importarPacientes`, batendo com a assinatura `consultorioId: number`
  documentada na Task 6.
