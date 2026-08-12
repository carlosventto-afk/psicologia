# Excluir/desativar paciente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir excluir um paciente (só quando não há sessão/recibo/recorrência vinculado nem outro paciente que o tenha como responsável financeiro) e, quando bloqueado, oferecer "Desativar" como alternativa reversível.

**Architecture:** Uma coluna `ativo` em `Paciente` (default `true`). Uma função de dados verifica 4 vínculos possíveis antes de qualquer tentativa de exclusão (sem depender de parsear erro do Postgres). Três novas Server Actions (`excluirPaciente`, `desativarPaciente`, `reativarPaciente`). A tela `/pacientes` ganha um filtro de status; os seletores de paciente usados em formulários passam a sempre excluir inativos.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions), Supabase Postgres. Sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc com `pg`/`@supabase/supabase-js` (camada de dados) e navegador real (camada de UI/fluxo).

## Global Constraints

- `ativo` nasce `true` para todo paciente novo e para os já existentes (default no `ADD COLUMN`).
- A checagem de vínculos roda ANTES da tentativa de `delete` — nunca depende de interpretar a mensagem de erro do Postgres.
- A checagem de `responsavel_financeiro` não filtra por `ativo` do dependente — bloqueia mesmo que o dependente esteja inativo.
- `desativarPaciente`/`reativarPaciente` nunca são bloqueadas por vínculos (sempre seguras, só mudam um boolean).
- `listarPacientesParaSelect` passa a filtrar `ativo = true` sempre, sem novo parâmetro — afeta automaticamente todos os 3 usos existentes (nova sessão, editar sessão, responsável financeiro).
- `/pacientes` mostra só ativos por padrão (`status` default `"ativos"`).
- Import por planilha (`importarPacientes`) não muda — dedup de nome continua olhando todos os pacientes, ativos e inativos.
- Confirmação de exclusão usa `window.confirm()` nativo do navegador — sem sistema de modal customizado (não existe um nesta base de código).

---

## Task 1: Migration — coluna `ativo` em `Paciente`

**Files:**
- Create: `supabase/migrations/20260812000001_add_ativo_paciente.sql`

**Interfaces:**
- Produces: coluna `ativo boolean not null default true` em `public."Paciente"`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Permite "desativar" um paciente (esconder das listas/seletores do dia
-- a dia) sem excluir de fato — usado quando a exclusão real é bloqueada
-- por sessão/recibo/recorrência vinculado, ou quando o profissional só
-- quer arquivar um paciente que encerrou o acompanhamento.
alter table public."Paciente"
  add column ativo boolean not null default true;
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260812000001_add_ativo_paciente.sql', 'utf8');
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

- [ ] **Step 3: Verificar a coluna criada**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'Paciente' and column_name = 'ativo'\");
  console.table(cols.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: uma linha — `ativo | boolean | NO | true`.

- [ ] **Step 4: Confirmar que pacientes já existentes nasceram `ativo = true`**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);
admin.from('Paciente').select('id', { count: 'exact', head: true }).eq('ativo', false).then(r => {
  console.log('pacientes existentes com ativo=false (esperado 0):', r.count, r.error?.message || '');
});
"
```

Expected: `0`.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260812000001_add_ativo_paciente.sql && git commit -m "feat: adiciona coluna ativo ao paciente"
```

---

## Task 2: Camada de dados — vínculos, filtro de status e seletor

**Files:**
- Modify: `web/lib/data/pacientes.js`

**Interfaces:**
- Consumes: coluna `ativo` do Task 1.
- Produces: `verificarVinculosPaciente(id)` retornando um array (vazio = sem bloqueio) de itens `{ tipo: string, quantidade: number }` ou `{ tipo: string, nomes: string[] }`. `listarPacientes({ busca, status })` — `status` é `"ativos" | "inativos" | "todos"`, default `"ativos"`. `listarPacientesParaSelect(excluirId)` — assinatura inalterada, mas sempre filtra `ativo = true` internamente.

- [ ] **Step 1: Adicionar `verificarVinculosPaciente` e ajustar `listarPacientes`/`listarPacientesParaSelect`**

Substituir o topo de `web/lib/data/pacientes.js` (as duas primeiras funções, linhas 4-58 hoje) por:

```js
export async function listarPacientes({ busca = "", status = "ativos" } = {}) {
  const supabase = await createClient();

  let query = supabase.from("Paciente").select("id, nome, telefone, email, valor_sessao, ativo").order("nome");

  if (busca) query = query.ilike("nome", `%${busca}%`);
  if (status === "ativos") query = query.eq("ativo", true);
  else if (status === "inativos") query = query.eq("ativo", false);

  const { data: pacientesBrutos, error } = await query;
  if (error) throw new Error(error.message);

  const pacientes = normalizarIdsLista(pacientesBrutos, ["id"]);
  if (pacientes.length === 0) return [];

  const ids = pacientes.map((p) => p.id);
  const hoje = new Date().toISOString().slice(0, 10);

  // Realizado = false cobre tanto sessões marcadas quanto as antigas sem
  // status definido (legado); usar status = 'Marcada' deixaria de fora as
  // sessões antigas com status nulo.
  const { data: sessoesBrutas, error: erroSessoes } = await supabase
    .from("Sessao")
    .select("paciente, data, horario")
    .in("paciente", ids)
    .eq("Realizado", false)
    .gte("data", hoje)
    .order("data")
    .order("horario");

  if (erroSessoes) throw new Error(erroSessoes.message);

  const sessoes = normalizarIdsLista(sessoesBrutas, ["paciente"]);

  const proximaSessaoPorPaciente = {};
  for (const s of sessoes) {
    if (!proximaSessaoPorPaciente[s.paciente]) {
      proximaSessaoPorPaciente[s.paciente] = s;
    }
  }

  return pacientes.map((p) => ({
    ...p,
    proxima_sessao: proximaSessaoPorPaciente[p.id] ?? null,
  }));
}

export async function listarPacientesParaSelect(excluirId) {
  const supabase = await createClient();
  let query = supabase.from("Paciente").select("id, nome, pacote").eq("ativo", true).order("nome");
  if (excluirId) query = query.neq("id", excluirId);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id", "pacote"]);
}

export async function verificarVinculosPaciente(id) {
  const supabase = await createClient();

  const [sessoes, recibos, recorrencias, dependentes] = await Promise.all([
    supabase.from("Sessao").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recibo").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recorrencia").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Paciente").select("nome").eq("responsavel_financeiro", id),
  ]);

  const vinculos = [];
  if (sessoes.count > 0) vinculos.push({ tipo: "sessão(ões)", quantidade: sessoes.count });
  if (recibos.count > 0) vinculos.push({ tipo: "recibo(s)", quantidade: recibos.count });
  if (recorrencias.count > 0) vinculos.push({ tipo: "recorrência(s)", quantidade: recorrencias.count });
  if (dependentes.data?.length > 0) {
    vinculos.push({ tipo: "é responsável financeiro de", nomes: dependentes.data.map((d) => d.nome) });
  }

  return vinculos;
}
```

- [ ] **Step 2: Verificar as 3 funções com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  // listarPacientesParaSelect deve sempre filtrar ativo=true
  const { data: ativo } = await admin.from('Paciente').insert({ nome: 'Teste Vinculos Ativo' }).select('id').single();
  const { data: inativo } = await admin.from('Paciente').insert({ nome: 'Teste Vinculos Inativo', ativo: false }).select('id').single();

  const selecionaveis = await admin.from('Paciente').select('id, nome').eq('ativo', true).neq('id', ativo.id).order('nome');
  const apareceInativo = selecionaveis.data.some((p) => p.id === inativo.id);
  console.log('inativo aparece no select de responsavel (esperado false):', apareceInativo);

  // verificarVinculosPaciente: sem vinculo nenhum
  const semVinculo = await admin.from('Sessao').select('id', { count: 'exact', head: true }).eq('paciente', ativo.id);
  console.log('sem vinculo, count esperado 0:', semVinculo.count);

  // com vinculo de responsavel_financeiro
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Vinculos Dependente', dependente: true, responsavel_financeiro: ativo.id }).select('id').single();
  const responsavelDe = await admin.from('Paciente').select('nome').eq('responsavel_financeiro', ativo.id);
  console.log('responsavel_financeiro de (esperado 1 nome):', JSON.stringify(responsavelDe.data));

  // status=inativos na listagem
  const listaInativos = await admin.from('Paciente').select('id, nome, ativo').eq('ativo', false);
  const contemInativo = listaInativos.data.some((p) => p.id === inativo.id);
  console.log('inativo aparece na lista status=inativos (esperado true):', contemInativo);

  await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  await admin.from('Paciente').delete().eq('id', ativo.id);
  await admin.from('Paciente').delete().eq('id', inativo.id);
  const restou = await admin.from('Paciente').select('id').in('id', [ativo.id, inativo.id, dependenteRow.id]);
  console.log('cleanup done, linhas restantes (esperado 0):', restou.data.length);
})();
"
```

Expected: `apareceInativo: false`, `count: 0`, um nome retornado em `responsavelDe`, `contemInativo: true`, `cleanup done, linhas restantes (esperado 0): 0`.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/pacientes.js && git commit -m "feat: filtro de ativo em listagens e checagem de vinculos do paciente"
```

---

## Task 3: Server Actions — excluir/desativar/reativar

**Files:**
- Modify: `web/lib/actions/pacientes.js`

**Interfaces:**
- Consumes: `verificarVinculosPaciente(id)` do Task 2.
- Produces: `excluirPaciente(id, prevState, formData)` retornando `{ bloqueado: true, vinculos }` (sem excluir nada) quando há vínculo, ou fazendo `redirect("/pacientes")` em caso de sucesso. `desativarPaciente(id)` e `reativarPaciente(id)` — assinatura de um único argumento (`id`), para uso com `.bind(null, id)` em `<form action={...}>` direto (sem `useActionState`).

- [ ] **Step 1: Adicionar as 3 actions**

No fim de `web/lib/actions/pacientes.js`, depois de `atualizarPaciente` (adicionar o import de `verificarVinculosPaciente` no topo do arquivo também):

```js
import { verificarVinculosPaciente } from "@/lib/data/pacientes";
```

(adicionar essa linha junto dos outros imports, no topo do arquivo)

```js
export async function excluirPaciente(id, prevState, formData) {
  const vinculos = await verificarVinculosPaciente(id);
  if (vinculos.length > 0) {
    return { bloqueado: true, vinculos };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").delete().eq("id", id);

  if (error) {
    return { error: "Não foi possível excluir o paciente." };
  }

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function desativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: false }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}

export async function reativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: true }).eq("id", id);

  if (error) return;

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}
```

Nota: `desativarPaciente`/`reativarPaciente` não retornam nada legível pelo cliente de propósito (chamadas via `<form action={...}>` direto, sem `useActionState` — ver Task 4). Se a atualização falhar, a página simplesmente não muda; não há necessidade de mensagem de erro para uma operação tão simples e sem efeitos colaterais perigosos.

- [ ] **Step 2: Verificar `excluirPaciente` bloqueando e desbloqueando, com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: responsavel } = await admin.from('Paciente').insert({ nome: 'Teste Excluir Responsavel' }).select('id').single();
  const { data: dependenteRow } = await admin.from('Paciente').insert({ nome: 'Teste Excluir Dependente', dependente: true, responsavel_financeiro: responsavel.id }).select('id').single();

  // replica a logica de verificarVinculosPaciente pro responsavel (deve bloquear)
  const dependentes = await admin.from('Paciente').select('nome').eq('responsavel_financeiro', responsavel.id);
  console.log('responsavel tem dependente vinculado (esperado 1):', dependentes.data.length);

  // desativar sempre funciona, mesmo bloqueado pra exclusao
  const { error: erroDesativar } = await admin.from('Paciente').update({ ativo: false }).eq('id', responsavel.id);
  console.log('desativar responsavel mesmo com dependente (esperado sem erro):', erroDesativar?.message || 'OK');

  // reativar
  const { error: erroReativar } = await admin.from('Paciente').update({ ativo: true }).eq('id', responsavel.id);
  console.log('reativar (esperado sem erro):', erroReativar?.message || 'OK');

  // excluir o dependente primeiro (sem vinculo), depois o responsavel (agora livre)
  const { error: erroExcluirDependente } = await admin.from('Paciente').delete().eq('id', dependenteRow.id);
  console.log('excluir dependente sem vinculo (esperado sem erro):', erroExcluirDependente?.message || 'OK');

  const dependentesDepois = await admin.from('Paciente').select('nome').eq('responsavel_financeiro', responsavel.id);
  console.log('responsavel sem dependente depois (esperado 0):', dependentesDepois.data.length);

  const { error: erroExcluirResponsavel } = await admin.from('Paciente').delete().eq('id', responsavel.id);
  console.log('excluir responsavel agora livre (esperado sem erro):', erroExcluirResponsavel?.message || 'OK');

  const restou = await admin.from('Paciente').select('id').in('id', [responsavel.id, dependenteRow.id]);
  console.log('cleanup confirmado, linhas restantes (esperado 0):', restou.data.length);
})();
"
```

Expected: `1` dependente vinculado, desativar/reativar sem erro mesmo com vínculo, excluir dependente sem erro, `0` dependentes depois, excluir responsável sem erro, `0` linhas restantes.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/actions/pacientes.js && git commit -m "feat: adiciona excluir/desativar/reativar paciente"
```

---

## Task 4: UI — ficha do paciente e filtro de status em `/pacientes`

**Files:**
- Create: `web/components/ExcluirPacienteBotao.js`
- Modify: `web/app/(app)/pacientes/[id]/page.js`
- Modify: `web/app/(app)/pacientes/page.js`

**Interfaces:**
- Consumes: `excluirPaciente`, `desativarPaciente`, `reativarPaciente` (Task 3); `listarPacientes({ busca, status })` (Task 2); `paciente.ativo` (Task 2, via `buscarPaciente` — já seleciona `select(...)` com `*` implícito? Não — ver Step 2 abaixo, precisa adicionar `ativo` ao select de `buscarPaciente`).
- Produces: nenhuma interface nova consumida por outra task — ponta de UI.

- [ ] **Step 1: Adicionar `ativo` ao select de `buscarPaciente`**

Em `web/lib/data/pacientes.js`, na função `buscarPaciente` (já existente, não faz parte do Task 2), adicionar `ativo` à string de `.select(...)`:

```js
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, precisa_recibo, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro, ativo, ResponsavelFinanceiro:responsavel_financeiro(nome)"
    )
```

(troca a string existente — é a única mudança nesse arquivo nesta task, incluída aqui porque a UI da Task 4 depende de `paciente.ativo` e nenhuma outra task tocaria nisso.)

- [ ] **Step 2: Criar `web/components/ExcluirPacienteBotao.js`**

```js
"use client";

import { useActionState } from "react";
import { excluirPaciente, desativarPaciente } from "@/lib/actions/pacientes";

const estadoInicial = {};

export default function ExcluirPacienteBotao({ pacienteId }) {
  const acaoComId = excluirPaciente.bind(null, pacienteId);
  const [state, formAction, pending] = useActionState(acaoComId, estadoInicial);
  const acaoDesativar = desativarPaciente.bind(null, pacienteId);

  function confirmarAntes(event) {
    if (!window.confirm("Tem certeza? Essa ação não pode ser desfeita.")) {
      event.preventDefault();
    }
  }

  if (state?.bloqueado) {
    return (
      <div className="card border border-yellow-200 bg-yellow-50 p-4 text-sm space-y-2">
        <p className="font-semibold text-navy">Não é possível excluir este paciente:</p>
        <ul className="list-disc list-inside text-muted">
          {state.vinculos.map((v, indice) => (
            <li key={indice}>
              {v.quantidade ? `${v.quantidade} ${v.tipo}` : `${v.tipo}: ${v.nomes.join(", ")}`}
            </li>
          ))}
        </ul>
        <form action={acaoDesativar}>
          <button type="submit" className="link text-sm">
            Desativar paciente
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={confirmarAntes}>
      <button type="submit" disabled={pending} className="link text-red-600 disabled:opacity-50">
        {pending ? "Excluindo..." : "Excluir"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Usar o novo componente e os botões Desativar/Reativar na ficha do paciente**

Em `web/app/(app)/pacientes/[id]/page.js`, adicionar os imports:

```js
import { desativarPaciente, reativarPaciente } from "@/lib/actions/pacientes";
import ExcluirPacienteBotao from "@/components/ExcluirPacienteBotao";
```

E trocar o bloco de links do cabeçalho (linhas 17-27 hoje) por:

```jsx
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/agenda/nova-sessao?paciente=${pacienteId}`} className="link">
            Nova Sessão
          </Link>
          <Link href="/recibos" className="link">
            Gerar Recibo
          </Link>
          <Link href={`/pacientes/${pacienteId}/editar`} className="link">
            Editar
          </Link>
          {paciente.ativo ? (
            <>
              <form action={desativarPaciente.bind(null, pacienteId)}>
                <button type="submit" className="link">
                  Desativar
                </button>
              </form>
              <ExcluirPacienteBotao pacienteId={pacienteId} />
            </>
          ) : (
            <form action={reativarPaciente.bind(null, pacienteId)}>
              <button type="submit" className="link">
                Reativar
              </button>
            </form>
          )}
        </div>
```

- [ ] **Step 4: Filtro de status em `/pacientes`**

Em `web/app/(app)/pacientes/page.js`, trocar o arquivo inteiro por:

```js
import Link from "next/link";
import { listarPacientes } from "@/lib/data/pacientes";

const ABAS_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

export default async function PaginaPacientes({ searchParams }) {
  const { q = "", status = "ativos" } = await searchParams;
  const pacientes = await listarPacientes({ busca: q, status });

  return (
    <div className="space-y-4">
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

      <div className="flex items-center justify-between gap-4">
        <form className="max-w-sm flex-1">
          <input type="hidden" name="status" value={status} />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome..."
            className="field mt-0"
          />
        </form>

        <div className="flex gap-1 text-sm">
          {ABAS_STATUS.map((aba) => (
            <Link
              key={aba.valor}
              href={q ? `?status=${aba.valor}&q=${q}` : `?status=${aba.valor}`}
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                status === aba.valor ? "bg-primary/10 text-primary" : "text-muted hover:bg-background"
              }`}
            >
              {aba.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {pacientes.length === 0 ? (
        <p className="empty-state">Nenhum paciente encontrado.</p>
      ) : (
        <div className="space-y-3">
          {pacientes.map((p) => (
            <Link
              key={p.id}
              href={`/pacientes/${p.id}`}
              className="card flex items-center justify-between px-4 py-3 transition-shadow hover:shadow-md"
            >
              <p className="font-semibold text-navy">{p.nome}</p>
              <p className="text-sm text-muted">
                {p.proxima_sessao
                  ? `Próxima sessão: ${p.proxima_sessao.data} ${p.proxima_sessao.horario}`
                  : "Sem sessão marcada"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

(o texto do `empty-state` muda de "Nenhum paciente cadastrado." para "Nenhum paciente encontrado." porque agora pode ser vazio por causa do filtro de status, não só por não ter nenhum paciente cadastrado.)

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/components/ExcluirPacienteBotao.js "web/app/(app)/pacientes/[id]/page.js" web/app/\(app\)/pacientes/page.js web/lib/data/pacientes.js && git commit -m "feat: excluir/desativar/reativar paciente e filtro de status na listagem"
```

---

## Task 5: Verificação end-to-end no navegador

**Files:** nenhum (só verificação manual/via browser).

**Interfaces:**
- Consumes: todas as anteriores.

- [ ] **Step 1: Pedir deploy**

Avisar o usuário para clicar em "Deploy" no EasyPanel.

- [ ] **Step 2: Criar pacientes descartáveis via navegador e testar o caminho bloqueado**

Criar um paciente "Paciente Excluir Bloqueado E2E", marcar uma sessão pra ele (ou usar um paciente existente com sessão, se preferir não criar agenda de teste), abrir a ficha dele e clicar em "Excluir". Confirmar o `window.confirm()`. Esperado: aparece o card de aviso listando o vínculo (ex.: "1 sessão(ões)") e o botão "Desativar" no lugar do botão "Excluir".

- [ ] **Step 3: Testar Desativar → filtro → Reativar**

Clicar em "Desativar" no card de aviso. Confirmar que a ficha passa a mostrar "Reativar" no lugar de "Desativar"/"Excluir". Ir em `/pacientes`, confirmar que esse paciente sumiu da aba "Ativos" e aparece em "Inativos" e "Todos". Ir em `/agenda/nova-sessao` (ou editar uma sessão existente) e confirmar que ele não aparece mais no seletor de paciente. Voltar na ficha dele e clicar "Reativar" — confirmar que volta a aparecer em "Ativos" e no seletor.

- [ ] **Step 4: Testar o caminho livre (exclusão de verdade)**

Criar um segundo paciente descartável sem nenhuma sessão/recibo/recorrência/dependente vinculado. Abrir a ficha, clicar "Excluir", confirmar o `window.confirm()`. Esperado: redireciona para `/pacientes` e o paciente não existe mais em nenhuma aba.

- [ ] **Step 5: Limpeza**

Excluir via script Node (service role key) qualquer paciente/sessão de teste que tenha sobrado do Step 2 (o "bloqueado" continua existindo — precisa apagar a sessão de teste primeiro, depois o paciente).
