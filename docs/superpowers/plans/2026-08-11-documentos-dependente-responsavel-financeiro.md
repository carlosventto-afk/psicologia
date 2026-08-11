# Documentos do paciente + Dependente/Responsável financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar CPF/RG ao cadastro de paciente e permitir marcar um paciente como "Dependente" de outro (responsável financeiro), refletindo isso em Recibos e Financeiro.

**Architecture:** Uma migration adiciona colunas + duas constraints `check` em `Paciente` (auto-referência via `responsavel_financeiro`). O formulário existente (`PacienteForm.js`) ganha duas seções novas. As telas de leitura (`/pacientes/[id]`, `/recibos`, `/financeiro`) passam a fazer um embed extra do `Paciente` (self-join via FK) pra mostrar o nome do responsável quando aplicável.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions), Supabase Postgres + PostgREST embeds, sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc com `pg`/`@supabase/supabase-js` (camada de dados) e navegador real via chrome-devtools MCP (camada de UI/fluxo).

## Global Constraints

- CPF e os campos de identidade (`rg_numero`, `rg_data_expedicao`, `rg_orgao_emissor`) são opcionais e independentes entre si — nenhum é obrigatório, não é preciso preencher os três juntos.
- `dependente` nasce `false` por padrão (novo paciente e migração de existentes).
- O responsável financeiro pode ele mesmo ser dependente de uma terceira pessoa — sem restrição de cadeia.
- Nas telas de Recibos e Financeiro, o nome do responsável **complementa** o nome do paciente ("Nome (dependente de Responsável)"), nunca o substitui.
- Nenhuma geração de PDF/documento de recibo é criada nesta rodada — fora de escopo (ver spec).
- Convenções do projeto: tabelas com nome capitalizado entre aspas (`"Paciente"`), colunas snake_case, migrations em `supabase/migrations/YYYYMMDDNNNNNN_descricao.sql`, aplicadas via script Node com `pg` (não há Supabase CLI disponível).

---

## Task 1: Migration — colunas e constraints em `Paciente`

**Files:**
- Create: `supabase/migrations/20260811000001_add_documentos_dependente_paciente.sql`

**Interfaces:**
- Produces: colunas `cpf text`, `rg_numero text`, `rg_data_expedicao date`, `rg_orgao_emissor text`, `dependente boolean not null default false`, `responsavel_financeiro bigint` (FK própria `"Paciente"(id)`, sem `on delete`) na tabela `public."Paciente"`; constraints `paciente_dependente_precisa_responsavel` e `paciente_responsavel_nao_pode_ser_proprio`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Documentos do paciente (CPF/RG) e responsável financeiro: nem todo
-- paciente é quem paga — quando é dependente de outra pessoa (ex.: um
-- filho), o responsável financeiro é quem deve aparecer na emissão de
-- recibo/nota. Ambos os grupos de campo são opcionais.
alter table public."Paciente"
  add column cpf text,
  add column rg_numero text,
  add column rg_data_expedicao date,
  add column rg_orgao_emissor text,
  add column dependente boolean not null default false,
  add column responsavel_financeiro bigint references public."Paciente"(id);

-- Sem "on delete set null" de propósito: um SET NULL automático violaria
-- a constraint abaixo (dependente sem responsável). Deixar o padrão
-- (NO ACTION) significa que não dá pra excluir um paciente enquanto ele
-- ainda for responsável financeiro de alguém — precisa reatribuir ou
-- desmarcar o dependente antes.
alter table public."Paciente"
  add constraint paciente_dependente_precisa_responsavel
    check (dependente = false or responsavel_financeiro is not null);

alter table public."Paciente"
  add constraint paciente_responsavel_nao_pode_ser_proprio
    check (responsavel_financeiro is null or responsavel_financeiro <> id);
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

Script (`SUPABASE_DB_PASSWORD` já deve estar no ambiente do shell, convenção já usada neste projeto):

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260811000001_add_documentos_dependente_paciente.sql', 'utf8');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  await client.query(sql);
  console.log('migration aplicada');
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: imprime `migration aplicada` sem erro.

- [ ] **Step 3: Verificar colunas e constraints criadas**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'Paciente' and column_name in ('cpf','rg_numero','rg_data_expedicao','rg_orgao_emissor','dependente','responsavel_financeiro') order by column_name\");
  console.table(cols.rows);
  const cons = await client.query(\"select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = '\\\"Paciente\\\"'::regclass and conname like 'paciente_%'\");
  console.table(cons.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: 6 colunas listadas com os tipos corretos, e as 2 constraints com a definição esperada (`CHECK (...)`).

- [ ] **Step 4: Testar as constraints com um paciente descartável**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  // dependente=true sem responsavel_financeiro deve falhar
  const { error: erro1 } = await admin.from('Paciente').insert({ nome: 'Teste Migration A', dependente: true, valor_sessao: 100 });
  console.log('esperado falhar (dependente sem responsavel):', erro1?.message);

  // paciente normal deve funcionar, e dependente=true com responsavel valido tambem
  const { data: responsavel, error: erroResp } = await admin.from('Paciente').insert({ nome: 'Teste Migration Responsavel', valor_sessao: 100 }).select('id').single();
  if (erroResp) { console.error('erro inesperado criando responsavel', erroResp); return; }

  const { data: dependenteRow, error: erroDep } = await admin.from('Paciente').insert({ nome: 'Teste Migration Dependente', dependente: true, responsavel_financeiro: responsavel.id, valor_sessao: 100 }).select('id').single();
  console.log('dependente com responsavel valido, erro esperado null:', erroDep?.message || 'OK criado id=' + dependenteRow?.id);

  // auto-referencia deve falhar
  const { error: erroAuto } = await admin.from('Paciente').update({ dependente: true, responsavel_financeiro: dependenteRow.id }).eq('id', dependenteRow.id);
  console.log('esperado falhar (auto-referencia):', erroAuto?.message);

  // limpeza
  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('cleanup done');
})();
"
```

Expected: a primeira inserção falha com mensagem citando `paciente_dependente_precisa_responsavel`; a segunda (responsável) e terceira (dependente válido) funcionam; a quarta (auto-referência) falha citando `paciente_responsavel_nao_pode_ser_proprio`; cleanup remove as duas linhas de teste.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260811000001_add_documentos_dependente_paciente.sql && git commit -m "feat: adiciona documentos (CPF/RG) e responsavel financeiro ao paciente"
```

---

## Task 2: Camada de dados — `lib/data/pacientes.js`

**Files:**
- Modify: `web/lib/data/pacientes.js`

**Interfaces:**
- Consumes: colunas/constraints do Task 1.
- Produces: `buscarPaciente(id)` agora retorna também `cpf`, `rg_numero`, `rg_data_expedicao`, `rg_orgao_emissor`, `dependente` (boolean), `responsavel_financeiro` (number ou null), `responsavel_nome` (string ou null). `listarPacientesParaSelect(excluirId)` — novo parâmetro opcional (number), filtra o próprio id fora da lista quando informado.

- [ ] **Step 1: Editar `buscarPaciente`**

Em `web/lib/data/pacientes.js`, substituir a função `buscarPaciente` (linhas 57-69 hoje) por:

```js
export async function buscarPaciente(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Paciente")
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, precisa_recibo, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro, ResponsavelFinanceiro:responsavel_financeiro(nome)"
    )
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  const normalizado = normalizarIds(data, ["id", "consultorio", "pacote", "responsavel_financeiro"]);
  return {
    ...normalizado,
    responsavel_nome: data.ResponsavelFinanceiro?.nome ?? null,
  };
}
```

- [ ] **Step 2: Editar `listarPacientesParaSelect`**

Substituir a função atual (linhas 49-55 hoje) por:

```js
export async function listarPacientesParaSelect(excluirId) {
  const supabase = await createClient();
  let query = supabase.from("Paciente").select("id, nome, pacote").order("nome");
  if (excluirId) query = query.neq("id", excluirId);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id", "pacote"]);
}
```

- [ ] **Step 3: Verificar o embed e o filtro com pacientes descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: responsavel } = await admin.from('Paciente').insert({ nome: 'Teste Data Responsavel', valor_sessao: 100 }).select('id').single();
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Data Dependente', dependente: true, responsavel_financeiro: responsavel.id, cpf: '111.222.333-44', rg_numero: 'MG-1234567', valor_sessao: 100 }).select('id').single();

  // mesma query que buscarPaciente faz
  const { data: busca, error } = await admin
    .from('Paciente')
    .select('id, nome, cpf, rg_numero, dependente, responsavel_financeiro, ResponsavelFinanceiro:responsavel_financeiro(nome)')
    .eq('id', dependenteRow.id)
    .single();
  console.log('embed error:', error?.message || 'nenhum');
  console.log('nome responsavel via embed:', busca?.ResponsavelFinanceiro?.nome, '(esperado: Teste Data Responsavel)');
  console.log('cpf:', busca?.cpf, 'rg_numero:', busca?.rg_numero);

  // mesma query que listarPacientesParaSelect(excluirId) faz
  const { data: lista } = await admin.from('Paciente').select('id, nome').neq('id', dependenteRow.id).order('nome');
  const apareceASiMesmo = lista.some((p) => p.id === dependenteRow.id);
  console.log('paciente aparece na propria lista de select (esperado false):', apareceASiMesmo);

  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('cleanup done');
})();
"
```

Expected: `embed error: nenhum`, nome do responsável correto, cpf/rg retornados, `apareceASiMesmo` = `false`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/pacientes.js && git commit -m "feat: expõe documentos e responsavel financeiro na leitura de paciente"
```

---

## Task 3: Server Actions — `lib/actions/pacientes.js`

**Files:**
- Modify: `web/lib/actions/pacientes.js`

**Interfaces:**
- Consumes: nada de tasks anteriores diretamente (grava nas colunas do Task 1).
- Produces: `criarPaciente`/`atualizarPaciente` agora aceitam e validam `cpf`, `rg_numero`, `rg_data_expedicao`, `rg_orgao_emissor`, `dependente`, `responsavel_financeiro`. Retornam `{ error: "Selecione o responsável financeiro." }` quando `dependente` vier marcado sem `responsavel_financeiro`.

- [ ] **Step 1: Editar `dadosDoFormulario` e adicionar validação**

Substituir o arquivo inteiro por:

```js
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dadosDoFormulario(formData) {
  const dependente = formData.get("dependente") === "on";
  const responsavelFinanceiro = dependente && formData.get("responsavel_financeiro")
    ? Number(formData.get("responsavel_financeiro"))
    : null;

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
    cpf: formData.get("cpf") || null,
    rg_numero: formData.get("rg_numero") || null,
    rg_data_expedicao: formData.get("rg_data_expedicao") || null,
    rg_orgao_emissor: formData.get("rg_orgao_emissor") || null,
    dependente,
    responsavel_financeiro: responsavelFinanceiro,
  };
}

function validarResponsavelFinanceiro(dados) {
  if (dados.dependente && !dados.responsavel_financeiro) {
    return "Selecione o responsável financeiro.";
  }
  return null;
}

export async function criarPaciente(prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const erroValidacao = validarResponsavelFinanceiro(dados);
  if (erroValidacao) return { error: erroValidacao };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("Paciente")
    .insert(dados)
    .select("id")
    .single();

  if (error) {
    return { error: "Não foi possível salvar o paciente." };
  }

  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function atualizarPaciente(id, prevState, formData) {
  const dados = dadosDoFormulario(formData);
  const erroValidacao = validarResponsavelFinanceiro(dados);
  if (erroValidacao) return { error: erroValidacao };

  const supabase = await createClient();

  const { error } = await supabase.from("Paciente").update(dados).eq("id", id);

  if (error) {
    return { error: "Não foi possível atualizar o paciente." };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}
```

- [ ] **Step 2: Verificar a regra "dependente descartado quando desmarcado"**

Isso não é testável fora de uma requisição real (a action usa `next/headers`), mas a lógica de `dadosDoFormulario` — `dependente && formData.get(...)` — garante isso pela leitura: se `dependente` for `false`, `responsavel_financeiro` é sempre `null` no objeto salvo, independente do que o formulário mandar. Confirmar lendo o trecho acima antes de seguir: `responsavelFinanceiro` só é calculado como não-null quando `dependente` é `true`. A verificação end-to-end fica para a Task 7 (via navegador).

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/pacientes.js && git commit -m "feat: valida e grava documentos e responsavel financeiro do paciente"
```

---

## Task 4: Formulário e ficha do paciente (UI)

**Files:**
- Modify: `web/components/PacienteForm.js`
- Modify: `web/app/(app)/pacientes/novo/page.js`
- Modify: `web/app/(app)/pacientes/[id]/editar/page.js`
- Modify: `web/app/(app)/pacientes/[id]/page.js`

**Interfaces:**
- Consumes: `listarPacientesParaSelect(excluirId)` e `buscarPaciente(id)` (Task 2), validação de `dependente`/`responsavel_financeiro` (Task 3).
- Produces: nenhuma interface nova consumida por outras tasks — ponta de UI.

- [ ] **Step 1: Adicionar as seções de Documentos e Responsável financeiro em `PacienteForm.js`**

Em `web/components/PacienteForm.js`, adicionar `pacientes` e `excluirId` às props (linha 7) e um estado local pro checkbox de dependente:

```js
"use client";

import { useActionState, useRef, useState } from "react";

const estadoInicial = {};

export default function PacienteForm({ action, paciente, pacotes, consultorios, pacientes = [] }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const valorSessaoRef = useRef(null);
  const [dependente, setDependente] = useState(Boolean(paciente?.dependente));
```

Manter `aoTrocarPacote` como está. Logo depois do bloco do checkbox "Precisa de recibo" (antes de `{state?.error && ...}`), adicionar:

```jsx
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Documentos</legend>
        <div>
          <label htmlFor="cpf" className="block text-sm font-semibold text-navy">
            CPF (opcional)
          </label>
          <input
            id="cpf"
            name="cpf"
            type="text"
            defaultValue={paciente?.cpf ?? ""}
            className="field"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="rg_numero" className="block text-sm font-semibold text-navy">
              RG - Número
            </label>
            <input
              id="rg_numero"
              name="rg_numero"
              type="text"
              defaultValue={paciente?.rg_numero ?? ""}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="rg_data_expedicao" className="block text-sm font-semibold text-navy">
              Data de expedição
            </label>
            <input
              id="rg_data_expedicao"
              name="rg_data_expedicao"
              type="date"
              defaultValue={paciente?.rg_data_expedicao ?? ""}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="rg_orgao_emissor" className="block text-sm font-semibold text-navy">
              Órgão emissor
            </label>
            <input
              id="rg_orgao_emissor"
              name="rg_orgao_emissor"
              type="text"
              defaultValue={paciente?.rg_orgao_emissor ?? ""}
              className="field"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy px-0">Responsável financeiro</legend>
        <div className="flex items-center gap-2">
          <input
            id="dependente"
            name="dependente"
            type="checkbox"
            checked={dependente}
            onChange={(e) => setDependente(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="dependente" className="text-sm font-semibold text-navy">
            Este paciente é dependente de outra pessoa
          </label>
        </div>

        {dependente && (
          <div>
            <label htmlFor="responsavel_financeiro" className="block text-sm font-semibold text-navy">
              Responsável financeiro
            </label>
            <select
              id="responsavel_financeiro"
              name="responsavel_financeiro"
              required={dependente}
              defaultValue={paciente?.responsavel_financeiro ?? ""}
              className="field"
            >
              <option value="" disabled>
                Selecione
              </option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
```

Nota: usar `checked`/`onChange` controlado no checkbox `dependente` (em vez de `defaultChecked`) é necessário porque o `<select>` só deve ser renderizado (e enviado no submit) quando o checkbox está marcado — se o usuário desmarcar depois de ter selecionado alguém, o campo desaparece do formulário e não é enviado, então a Server Action nunca recebe um `responsavel_financeiro` associado a `dependente=false`.

- [ ] **Step 2: Passar `pacientes` e `excluirId` nas páginas que usam o formulário**

Em `web/app/(app)/pacientes/novo/page.js`, importar `listarPacientesParaSelect` e passar a lista:

```js
import PacienteForm from "@/components/PacienteForm";
import { criarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";

export default async function PaginaNovoPaciente() {
  const [pacotes, consultorios, pacientes] = await Promise.all([
    listarPacotes(),
    listarConsultorios(),
    listarPacientesParaSelect(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Paciente</h1>
      <PacienteForm action={criarPaciente} pacotes={pacotes} consultorios={consultorios} pacientes={pacientes} />
    </div>
  );
}
```

Em `web/app/(app)/pacientes/[id]/editar/page.js`:

```js
import PacienteForm from "@/components/PacienteForm";
import { buscarPaciente, listarPacientesParaSelect } from "@/lib/data/pacientes";
import { atualizarPaciente } from "@/lib/actions/pacientes";
import { listarPacotes } from "@/lib/data/pacotes";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaEditarPaciente({ params }) {
  const { id } = await params;
  const pacienteId = Number(id);
  const [paciente, pacotes, consultorios, pacientes] = await Promise.all([
    buscarPaciente(pacienteId),
    listarPacotes(),
    listarConsultorios(),
    listarPacientesParaSelect(pacienteId),
  ]);
  const acaoComId = atualizarPaciente.bind(null, pacienteId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Paciente</h1>
      <PacienteForm
        action={acaoComId}
        paciente={paciente}
        pacotes={pacotes}
        consultorios={consultorios}
        pacientes={pacientes}
      />
    </div>
  );
}
```

- [ ] **Step 3: Mostrar os novos campos na ficha do paciente**

Em `web/app/(app)/pacientes/[id]/page.js`, dentro do grid de informações (depois do bloco "Valor da sessão", antes do bloco condicional de "Observações"):

```jsx
        <div>
          <p className="text-muted">CPF</p>
          <p>{paciente.cpf || "—"}</p>
        </div>
        <div>
          <p className="text-muted">RG</p>
          <p>
            {paciente.rg_numero || "—"}
            {paciente.rg_orgao_emissor && ` · ${paciente.rg_orgao_emissor}`}
            {paciente.rg_data_expedicao && ` · exp. ${paciente.rg_data_expedicao}`}
          </p>
        </div>
        {paciente.dependente && (
          <div className="col-span-2">
            <p className="text-muted">Responsável financeiro</p>
            <p>{paciente.responsavel_nome || "—"}</p>
          </div>
        )}
```

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/components/PacienteForm.js web/app/\(app\)/pacientes/novo/page.js "web/app/(app)/pacientes/[id]/editar/page.js" "web/app/(app)/pacientes/[id]/page.js" && git commit -m "feat: formulario e ficha do paciente exibem documentos e responsavel financeiro"
```

---

## Task 5: Recibos — mostrar dependente/responsável

**Files:**
- Modify: `web/lib/data/recibos.js`
- Modify: `web/app/(app)/recibos/page.js`

**Interfaces:**
- Consumes: mesmo hint de FK usado no Task 2 (`responsavel_financeiro`).
- Produces: `listarSessoesElegiveisParaRecibo()` e `listarRecibosEmitidos()` retornam também `paciente_dependente` (boolean) e `responsavel_nome` (string ou null) por item.

- [ ] **Step 1: Editar `lib/data/recibos.js`**

Substituir o arquivo inteiro por:

```js
import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarSessoesElegiveisParaRecibo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, Paciente!inner(id, nome, precisa_recibo, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), Recibo(id)"
    )
    .eq("Realizado", true)
    .eq("Paciente.precisa_recibo", true)
    .order("data", { ascending: false });

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.Recibo?.length ?? 0) === 0)
    .map((s) =>
      normalizarIds(
        {
          id: s.id,
          data: s.data,
          horario: s.horario,
          paciente_nome: s.Paciente.nome,
          paciente_dependente: s.Paciente.dependente,
          responsavel_nome: s.Paciente.ResponsavelFinanceiro?.nome ?? null,
        },
        ["id"]
      )
    );
}

export async function listarRecibosEmitidos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Recibo")
    .select(
      "id, data_emissao, Paciente(nome, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome))"
    )
    .order("data_emissao", { ascending: false });

  if (error) throw new Error(error.message);

  return data.map((r) =>
    normalizarIds(
      {
        id: r.id,
        data_emissao: r.data_emissao,
        paciente_nome: r.Paciente?.nome ?? "—",
        paciente_dependente: r.Paciente?.dependente ?? false,
        responsavel_nome: r.Paciente?.ResponsavelFinanceiro?.nome ?? null,
      },
      ["id"]
    )
  );
}
```

- [ ] **Step 2: Editar `app/(app)/recibos/page.js`**

Trocar as duas ocorrências de `{s.paciente_nome}` / `{r.paciente_nome}` (linhas 25 e 50 hoje) por uma exibição que inclui o responsável quando aplicável. Nome do paciente elegível (dentro do `.map((s) => ...)`, substituindo `<p className="font-semibold text-navy">{s.paciente_nome}</p>`):

```jsx
                  <div>
                    <p className="font-semibold text-navy">
                      {s.paciente_nome}
                      {s.paciente_dependente && s.responsavel_nome && (
                        <span className="text-muted font-normal"> (dependente de {s.responsavel_nome})</span>
                      )}
                    </p>
                    <p className="text-muted">
                      {s.data} {s.horario}
                    </p>
                  </div>
```

Recibos emitidos (substituindo `<span className="font-semibold text-navy">{r.paciente_nome}</span>`):

```jsx
                <span className="font-semibold text-navy">
                  {r.paciente_nome}
                  {r.paciente_dependente && r.responsavel_nome && (
                    <span className="text-muted font-normal"> (dependente de {r.responsavel_nome})</span>
                  )}
                </span>
```

- [ ] **Step 3: Verificar o embed com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: responsavel } = await admin.from('Paciente').insert({ nome: 'Teste Recibo Responsavel', valor_sessao: 100 }).select('id').single();
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Recibo Dependente', dependente: true, responsavel_financeiro: responsavel.id, precisa_recibo: true, valor_sessao: 100 }).select('id').single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: dependenteRow.id, data: '2026-08-01', horario: '10:00', Realizado: true }).select('id').single();

  const { data, error } = await admin
    .from('Sessao')
    .select('id, data, horario, Paciente!inner(id, nome, precisa_recibo, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), Recibo(id)')
    .eq('id', sessao.id)
    .single();
  console.log('error:', error?.message || 'nenhum');
  console.log('paciente_nome:', data?.Paciente?.nome, 'dependente:', data?.Paciente?.dependente, 'responsavel:', data?.Paciente?.ResponsavelFinanceiro?.nome);

  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('cleanup done');
})();
"
```

Expected: `error: nenhum`, `dependente: true`, `responsavel: Teste Recibo Responsavel`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/recibos.js "web/app/(app)/recibos/page.js" && git commit -m "feat: recibos mostram responsavel financeiro do paciente dependente"
```

---

## Task 6: Financeiro — mostrar dependente/responsável nos inadimplentes

**Files:**
- Modify: `web/lib/data/financeiro.js`
- Modify: `web/app/(app)/financeiro/page.js`

**Interfaces:**
- Consumes: mesmo hint de FK dos Tasks 2 e 5.
- Produces: `listarInadimplentes()` retorna também `paciente_dependente` e `responsavel_nome` por item.

- [ ] **Step 1: Editar `listarInadimplentes` em `lib/data/financeiro.js`**

Substituir a função (linhas 38-62 hoje) por:

```js
export async function listarInadimplentes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, Paciente!inner(id, nome, valor_sessao, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), PagamentoSessao(id)"
    )
    .eq("Realizado", true)
    .order("data");

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.PagamentoSessao?.length ?? 0) === 0)
    .map((s) =>
      normalizarIds(
        {
          sessao_id: s.id,
          data: s.data,
          paciente_id: s.Paciente.id,
          paciente_nome: s.Paciente.nome,
          paciente_dependente: s.Paciente.dependente,
          responsavel_nome: s.Paciente.ResponsavelFinanceiro?.nome ?? null,
          valor_devido: s.Paciente.valor_sessao,
        },
        ["sessao_id", "paciente_id"]
      )
    );
}
```

- [ ] **Step 2: Editar `app/(app)/financeiro/page.js`**

No bloco de inadimplentes, substituir:

```jsx
                <Link href={`/pacientes/${i.paciente_id}`} className="font-semibold text-navy">
                  {i.paciente_nome}
                </Link>
```

por:

```jsx
                <Link href={`/pacientes/${i.paciente_id}`} className="font-semibold text-navy">
                  {i.paciente_nome}
                  {i.paciente_dependente && i.responsavel_nome && (
                    <span className="text-muted font-normal"> (dependente de {i.responsavel_nome})</span>
                  )}
                </Link>
```

- [ ] **Step 3: Verificar o embed com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: responsavel } = await admin.from('Paciente').insert({ nome: 'Teste Financeiro Responsavel', valor_sessao: 100 }).select('id').single();
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Financeiro Dependente', dependente: true, responsavel_financeiro: responsavel.id, valor_sessao: 150 }).select('id').single();
  const { data: sessao } = await admin.from('Sessao').insert({ paciente: dependenteRow.id, data: '2026-08-01', horario: '10:00', Realizado: true }).select('id').single();

  const { data, error } = await admin
    .from('Sessao')
    .select('id, data, Paciente!inner(id, nome, valor_sessao, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), PagamentoSessao(id)')
    .eq('id', sessao.id)
    .single();
  console.log('error:', error?.message || 'nenhum');
  console.log('dependente:', data?.Paciente?.dependente, 'responsavel:', data?.Paciente?.ResponsavelFinanceiro?.nome, 'sem pagamento (esperado []):', data?.PagamentoSessao);

  await admin.from('Sessao').delete().eq('id', sessao.id);
  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('cleanup done');
})();
"
```

Expected: `error: nenhum`, `dependente: true`, `responsavel: Teste Financeiro Responsavel`, `PagamentoSessao: []`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/financeiro.js "web/app/(app)/financeiro/page.js" && git commit -m "feat: financeiro mostra responsavel financeiro nos inadimplentes"
```

---

## Task 7: Verificação end-to-end no navegador

**Files:** nenhum (só verificação manual/via browser).

**Interfaces:**
- Consumes: todas as anteriores, rodando juntas via requisição HTTP real (a única forma de exercitar as Server Actions, que dependem de `next/headers`).

- [ ] **Step 1: Pedir deploy**

Avisar o usuário para clicar em "Deploy" no EasyPanel (não há API de deploy documentada para este projeto — é um clique manual no painel).

- [ ] **Step 2: Criar dois pacientes descartáveis via navegador (chrome-devtools MCP, contexto isolado)**

Usar `mcp__chrome-devtools__new_page` com `isolatedContext` pra não interferir na sessão real do usuário logado. Fazer login com um usuário de teste (ou usar a sessão existente se for seguro), navegar até `/pacientes/novo`, criar "Paciente Responsavel E2E" sem marcar dependente. Depois criar "Paciente Dependente E2E", marcar o checkbox "Este paciente é dependente de outra pessoa", confirmar que o `<select>` aparece e lista "Paciente Responsavel E2E", selecioná-lo, preencher CPF e os três campos de RG, salvar.

Expected: paciente salvo sem erro, redireciona pra ficha do paciente (`/pacientes/[id]`), ficha mostra CPF, RG e "Responsável financeiro: Paciente Responsavel E2E".

- [ ] **Step 3: Testar a validação de dependente sem responsável**

Editar "Paciente Dependente E2E", desmarcar o checkbox, salvar — confirmar que salva normalmente (paciente deixa de ser dependente). Editar de novo, marcar o checkbox mas não selecionar ninguém no `<select>` antes de enviar — como o campo é `required` no HTML, o navegador deve bloquear o submit nativamente; confirmar esse comportamento.

- [ ] **Step 4: Testar a exibição em Recibos e Financeiro**

Marcar "Precisa de recibo" em "Paciente Dependente E2E" (se ainda não estiver), criar uma sessão realizada pra ele (via `/agenda` ou diretamente), navegar até `/recibos` e `/financeiro` — confirmar que a linha do dependente mostra "Paciente Dependente E2E (dependente de Paciente Responsavel E2E)".

- [ ] **Step 5: Limpeza**

Excluir a sessão de teste e os dois pacientes descartáveis via script Node com a service role key (mesmo padrão dos Tasks 1, 2, 5 e 6), já que não há tela de exclusão de paciente na UI.

- [ ] **Step 6: Fechar a página do navegador**

Usar `mcp__chrome-devtools__close_page` na aba criada no Step 2.
