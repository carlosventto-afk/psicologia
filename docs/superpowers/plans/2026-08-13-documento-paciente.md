# Campo "Documento" no paciente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar `Paciente.precisa_recibo` (boolean) por `Paciente.documento` (`null` | `'recibo'` | `'nota_fiscal'`), atualizando cadastro, tela de recibos e import por planilha — sem construir nenhuma emissão de nota fiscal ainda.

**Architecture:** Uma migration adiciona `documento`, migra os dados de `precisa_recibo` e remove a coluna antiga. O formulário de paciente troca um checkbox por um select de 3 opções. `/recibos` continua só lidando com `documento = 'recibo'`, sem mudança de comportamento. O import por planilha ganha um parser tolerante a variações de texto pro novo campo.

**Tech Stack:** Next.js 16 App Router (Server Components/Actions), Supabase Postgres. Sem framework de teste automatizado neste projeto — verificação via scripts Node ad-hoc com `pg`/`@supabase/supabase-js`.

## Global Constraints

- `documento` é nullable, sem default — `null` significa "nenhum documento" e é o padrão pra paciente novo.
- Valores internos são `'recibo'` e `'nota_fiscal'` (não os rótulos de exibição "Receita Saúde"/"Nota Fiscal") — `'recibo'` mapeia direto pra tabela `Recibo`.
- `precisa_recibo` é removida na mesma migration — nenhum código deve continuar referenciando essa coluna depois desta entrega.
- `/recibos` não muda de nome nem de comportamento visual nesta entrega — só troca o campo de filtro por trás. Pacientes com `documento = 'nota_fiscal'` ou `null` não aparecem lá.
- Import por planilha: célula vazia ou texto não reconhecido no campo "Documento" vira `null`, sem gerar aviso na linha (mesmo padrão de campo livre já usado pra `telefone`/`endereco`).

---

## Task 1: Migration — coluna `documento`, migração de dados, remoção de `precisa_recibo`

**Files:**
- Create: `supabase/migrations/20260813000002_add_documento_paciente.sql`

**Interfaces:**
- Produces: coluna `documento text` em `public."Paciente"`, com `check (documento in ('recibo', 'nota_fiscal'))`, nullable, sem default. Coluna `precisa_recibo` removida.

- [ ] **Step 1: Escrever a migration**

```sql
-- Documento fiscal que o paciente recebe: 'recibo' (Receita Saude, nome
-- do programa do governo) ou 'nota_fiscal' (NFS-e -- emissao real ainda
-- nao existe, ver backlog item 7). Vazio (null) = paciente nao recebe
-- nenhum documento, e fica de fora de qualquer geracao em lote (hoje ou
-- no futuro). Substitui o boolean precisa_recibo.
alter table public."Paciente"
  add column documento text check (documento in ('recibo', 'nota_fiscal'));

update public."Paciente" set documento = 'recibo' where precisa_recibo = true;

alter table public."Paciente" drop column precisa_recibo;
```

- [ ] **Step 2: Aplicar a migration no banco de produção**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('../supabase/migrations/20260813000002_add_documento_paciente.sql', 'utf8');
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

- [ ] **Step 3: Verificar a coluna, a constraint e que `precisa_recibo` sumiu**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + '@db.rohulajgyxdangxfurha.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const cols = await client.query(\"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'Paciente' and column_name in ('documento', 'precisa_recibo')\");
  console.table(cols.rows);
  const contagem = await client.query('select documento, count(*) from public.\"Paciente\" group by documento');
  console.table(contagem.rows);
  await client.end();
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: só uma linha de coluna (`documento`, nullable, sem default) — `precisa_recibo` não aparece mais. A contagem por `documento` mostra os pacientes que tinham `precisa_recibo = true` agora em `'recibo'`, e o resto em `null`.

- [ ] **Step 4: Testar a constraint com um paciente descartável**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: p1, error: e1 } = await admin.from('Paciente').insert({ nome: 'Teste Documento Vazio' }).select('documento').single();
  console.log('sem informar documento (esperado null):', p1?.documento, e1?.message || '');

  const { data: p2, error: e2 } = await admin.from('Paciente').insert({ nome: 'Teste Documento Recibo', documento: 'recibo' }).select('documento').single();
  console.log('documento=recibo (esperado sem erro):', p2?.documento, e2?.message || '');

  const { data: p3, error: e3 } = await admin.from('Paciente').insert({ nome: 'Teste Documento Nota', documento: 'nota_fiscal' }).select('documento').single();
  console.log('documento=nota_fiscal (esperado sem erro):', p3?.documento, e3?.message || '');

  const { error: e4 } = await admin.from('Paciente').insert({ nome: 'Teste Documento Invalido', documento: 'invalido' });
  console.log('documento=invalido (esperado falhar):', e4?.message);

  const idsCriados = [p1?.id, p2?.id, p3?.id].filter(Boolean);
  const { error: erroDelete } = await admin.from('Paciente').delete().in('id', idsCriados);
  const restou = await admin.from('Paciente').select('id').in('id', idsCriados);
  console.log('cleanup done, erro delete:', erroDelete?.message || 'nenhum', ', linhas restantes (esperado 0):', restou.data?.length);
})();
"
```

Expected: `null` no primeiro, `recibo`/`nota_fiscal` sem erro nos dois seguintes, o inválido falha citando a constraint, cleanup sem erro e 0 linhas restantes.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add supabase/migrations/20260813000002_add_documento_paciente.sql && git commit -m "feat: adiciona coluna documento e remove precisa_recibo do paciente"
```

---

## Task 2: Cadastro de paciente — select "Documento"

**Files:**
- Modify: `web/lib/data/pacientes.js`
- Modify: `web/lib/actions/pacientes.js`
- Modify: `web/components/PacienteForm.js`

**Interfaces:**
- Consumes: coluna `documento` do Task 1.
- Produces: `buscarPaciente(id)` retorna `documento` (string ou `null`) no lugar de `precisa_recibo`. `dadosDoFormulario(formData)` retorna `documento` no lugar de `precisa_recibo`.

- [ ] **Step 1: Trocar `precisa_recibo` por `documento` no select de `buscarPaciente`**

Em `web/lib/data/pacientes.js`, na função `buscarPaciente`, trocar a string do `.select(...)`:

```js
    .select(
      "id, nome, data_nascimento, telefone, email, endereco, observacoes, valor_sessao, consultorio, pacote, documento, cpf, rg_numero, rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro, ativo, ResponsavelFinanceiro:responsavel_financeiro(nome)"
    )
```

- [ ] **Step 2: Trocar `precisa_recibo` por `documento` em `dadosDoFormulario`**

Em `web/lib/actions/pacientes.js`, dentro de `dadosDoFormulario`:

```js
    documento: formData.get("documento") || null,
```

(no lugar de `precisa_recibo: formData.get("precisa_recibo") === "on",`)

- [ ] **Step 3: Trocar o checkbox pelo select no formulário**

Em `web/components/PacienteForm.js`, trocar o bloco do checkbox (linhas 160-171 hoje):

```jsx
      <div>
        <label htmlFor="documento" className="block text-sm font-semibold text-navy">
          Documento
        </label>
        <select id="documento" name="documento" defaultValue={paciente?.documento ?? ""} className="field">
          <option value="">Nenhum</option>
          <option value="recibo">Receita Saúde</option>
          <option value="nota_fiscal">Nota Fiscal</option>
        </select>
      </div>
```

- [ ] **Step 4: Verificar `dadosDoFormulario` e o select de `buscarPaciente` com um paciente descartável**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: p, error: eIns } = await admin.from('Paciente').insert({ nome: 'Teste Form Documento', documento: 'nota_fiscal' }).select('id').single();
  if (eIns) { console.error('insert error', eIns); return; }

  // mesma query que buscarPaciente faz
  const busca = await admin.from('Paciente').select('id, nome, documento, cpf').eq('id', p.id).single();
  console.log('buscarPaciente inclui documento (esperado nota_fiscal):', busca.data?.documento, busca.error?.message || '');

  // simula dadosDoFormulario com documento vazio (equivalente a nao selecionar nada)
  const documentoVazio = '' || null;
  const { error: eUpdate } = await admin.from('Paciente').update({ documento: documentoVazio }).eq('id', p.id);
  const { data: depois } = await admin.from('Paciente').select('documento').eq('id', p.id).single();
  console.log('documento apos formData.get vazio -> null (esperado null):', depois?.documento, eUpdate?.message || '');

  const { error: erroDelete } = await admin.from('Paciente').delete().eq('id', p.id);
  const restou = await admin.from('Paciente').select('id').eq('id', p.id);
  console.log('cleanup done, erro delete:', erroDelete?.message || 'nenhum', ', linhas restantes (esperado 0):', restou.data?.length);
})();
"
```

Expected: `documento: nota_fiscal` na primeira leitura, `null` depois do update simulando campo vazio, cleanup sem erro e 0 linhas restantes.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/pacientes.js web/lib/actions/pacientes.js web/components/PacienteForm.js && git commit -m "feat: troca checkbox precisa_recibo por select Documento no cadastro de paciente"
```

---

## Task 3: `/recibos` — filtra por `documento = 'recibo'`

**Files:**
- Modify: `web/lib/data/recibos.js`
- Modify: `web/app/(app)/(gestao)/recibos/page.js`

**Interfaces:**
- Consumes: coluna `documento` do Task 1.
- Produces: nenhuma interface nova consumida por outra task — ponta de dados/UI.

- [ ] **Step 1: Trocar o filtro e o campo buscado em `listarSessoesElegiveisParaRecibo`**

Em `web/lib/data/recibos.js`, trocar:

```js
    .select(
      "id, data, horario, Paciente!inner(id, nome, precisa_recibo, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), Recibo(id)"
    )
    .eq("Realizado", true)
    .eq("Paciente.precisa_recibo", true)
```

Por:

```js
    .select(
      "id, data, horario, Paciente!inner(id, nome, documento, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), Recibo(id)"
    )
    .eq("Realizado", true)
    .eq("Paciente.documento", "recibo")
```

- [ ] **Step 2: Atualizar o texto do estado vazio na tela**

Em `web/app/(app)/(gestao)/recibos/page.js`, trocar:

```jsx
            Nenhuma sessão disponível para recibo. Só aparecem aqui sessões de pacientes marcados como "Precisa de
            recibo" no cadastro.
```

Por:

```jsx
            Nenhuma sessão disponível para recibo. Só aparecem aqui sessões de pacientes com "Documento" marcado
            como Receita Saúde no cadastro.
```

- [ ] **Step 3: Verificar o filtro com dados descartáveis**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const admin = createClient(url, serviceKey);

(async () => {
  const { data: pRecibo } = await admin.from('Paciente').select('id, owner').limit(1).single();
  const owner = pRecibo.owner;
  const { data: p1 } = await admin.from('Paciente').insert({ nome: 'Teste Filtro Recibo', documento: 'recibo', owner }).select('id').single();
  const { data: p2 } = await admin.from('Paciente').insert({ nome: 'Teste Filtro Nota', documento: 'nota_fiscal', owner }).select('id').single();
  const { data: p3 } = await admin.from('Paciente').insert({ nome: 'Teste Filtro Vazio', owner }).select('id').single();

  const { data, error } = await admin
    .from('Paciente')
    .select('id, nome, documento')
    .eq('documento', 'recibo')
    .in('id', [p1.id, p2.id, p3.id]);
  console.log('filtro documento=recibo retorna so p1 (esperado 1):', data.length, error?.message || '');

  await admin.from('Paciente').delete().in('id', [p1.id, p2.id, p3.id]);
  const restou = await admin.from('Paciente').select('id').in('id', [p1.id, p2.id, p3.id]);
  console.log('cleanup done, linhas restantes (esperado 0):', restou.data?.length);
})();
"
```

Expected: `1` resultado (só o paciente com `documento = 'recibo'`), cleanup com 0 linhas restantes.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/lib/data/recibos.js "web/app/(app)/(gestao)/recibos/page.js" && git commit -m "feat: /recibos filtra por documento=recibo em vez de precisa_recibo"
```

---

## Task 4: Import por planilha — campo "Documento"

**Files:**
- Modify: `web/components/ImportarPacientesWizard.js`
- Modify: `web/lib/actions/importar-pacientes.js`
- Modify: `web/scripts/gerar-planilha-modelo-pacientes.mjs`

**Interfaces:**
- Consumes: coluna `documento` do Task 1.
- Produces: nenhuma interface nova consumida por outra task.

- [ ] **Step 1: Trocar a entrada `precisa_recibo` por `documento` em `CAMPOS`**

Em `web/components/ImportarPacientesWizard.js`, trocar:

```js
  {
    chave: "precisa_recibo",
    rotulo: "Precisa de recibo",
    obrigatorio: false,
    aliases: ["precisa de recibo", "recibo"],
  },
```

Por:

```js
  {
    chave: "documento",
    rotulo: "Documento",
    obrigatorio: false,
    aliases: ["documento"],
  },
```

- [ ] **Step 2: Trocar `parsearRecibo` por `parsearDocumento` na server action**

Em `web/lib/actions/importar-pacientes.js`, trocar a função (linhas 36-39 hoje):

```js
function parsearRecibo(texto) {
  const normalizado = (texto ?? "").trim().toLowerCase();
  return ["sim", "yes", "true", "1"].includes(normalizado);
}
```

Por:

```js
function parsearDocumento(texto) {
  const normalizado = (texto ?? "").trim().toLowerCase();
  if (["receita saude", "receita saúde", "recibo"].includes(normalizado)) return "recibo";
  if (["nota fiscal", "nf", "nota"].includes(normalizado)) return "nota_fiscal";
  return null;
}
```

E, no objeto `candidatos.push({...})` da mesma função (dentro de `importarPacientes`), trocar:

```js
      precisa_recibo: parsearRecibo(linha.precisa_recibo),
```

Por:

```js
      documento: parsearDocumento(linha.documento),
```

- [ ] **Step 3: Atualizar a planilha modelo**

Em `web/scripts/gerar-planilha-modelo-pacientes.mjs`, trocar `"Precisa de recibo"` por `"Documento"` em `cabecalho`, e `"Sim"` por `"Receita Saúde"` em `exemplo` (mesma posição no array, entre `"Observações"`/o valor de observações e `"CPF"`/o valor de CPF).

- [ ] **Step 4: Regenerar o `.xlsx` publicado**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node scripts/gerar-planilha-modelo-pacientes.mjs
```

Expected: imprime `Planilha modelo gerada em ...public/planilha-modelo-pacientes.xlsx`.

- [ ] **Step 5: Verificar o conteúdo da planilha gerada e o parser isoladamente**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia\web" && node -e "
const XLSX = require('xlsx');
const wb = XLSX.readFile('public/planilha-modelo-pacientes.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log('cabecalho:', JSON.stringify(rows[0]));
console.log('exemplo:', JSON.stringify(rows[1]));

function parsearDocumento(texto) {
  const normalizado = (texto ?? '').trim().toLowerCase();
  if (['receita saude', 'receita saúde', 'recibo'].includes(normalizado)) return 'recibo';
  if (['nota fiscal', 'nf', 'nota'].includes(normalizado)) return 'nota_fiscal';
  return null;
}
console.log('parsearDocumento(\"Receita Saúde\"):', parsearDocumento('Receita Saúde'));
console.log('parsearDocumento(\"nota fiscal\"):', parsearDocumento('nota fiscal'));
console.log('parsearDocumento(\"\"):', parsearDocumento(''));
console.log('parsearDocumento(\"xyz\"):', parsearDocumento('xyz'));
"
```

Expected: cabeçalho contém `"Documento"` (não mais `"Precisa de recibo"`), exemplo contém `"Receita Saúde"` na mesma posição; `parsearDocumento` retorna `recibo`, `nota_fiscal`, `null`, `null` respectivamente.

- [ ] **Step 6: Commit**

```bash
cd "c:\Users\Administrador\Desktop\Projetos\Psicologia" && git add web/components/ImportarPacientesWizard.js web/lib/actions/importar-pacientes.js web/scripts/gerar-planilha-modelo-pacientes.mjs web/public/planilha-modelo-pacientes.xlsx && git commit -m "feat: import por planilha aceita campo Documento (Receita Saude/Nota Fiscal)"
```

---

## Task 5: Verificação end-to-end no navegador

**Files:** nenhum (só verificação manual/via browser).

**Interfaces:**
- Consumes: todas as anteriores.

- [ ] **Step 1: Pedir deploy**

Avisar o usuário para clicar em "Deploy" no EasyPanel.

- [ ] **Step 2: Testar o cadastro de paciente**

Criar (ou editar) um paciente pelo formulário, escolher "Receita Saúde" no campo Documento, salvar, reabrir a edição e confirmar que o select mantém "Receita Saúde" selecionado. Repetir escolhendo "Nota Fiscal" e "Nenhum".

- [ ] **Step 3: Testar `/recibos`**

Marcar um paciente de teste como "Receita Saúde", registrar e marcar uma sessão dele como realizada, confirmar que ele aparece em "Sessões elegíveis" em `/recibos` e que "Gerar recibo" continua funcionando. Confirmar que um paciente marcado "Nota Fiscal" com sessão realizada **não** aparece na lista.

- [ ] **Step 4: Testar o import por planilha**

Baixar a planilha modelo em `/pacientes/importar`, confirmar que a coluna "Documento" aparece com o valor de exemplo "Receita Saúde", e que o mapeamento automático da coluna funciona sem precisar selecionar manualmente.

- [ ] **Step 5: Limpeza**

Excluir via script Node (service role key) qualquer paciente/sessão de teste criado nos passos acima.
