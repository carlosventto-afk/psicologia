# Campo "Documento" no paciente (Receita Saúde / Nota Fiscal)

## Contexto

Item 6 do backlog (`docs/backlog-novas-funcionalidades.md`). Hoje
`Paciente.precisa_recibo` é um boolean (sim/não). Nem todo paciente que
precisa de documento fiscal quer o mesmo tipo: alguns preferem **Receita
Saúde** (nome do programa do governo pro que hoje o sistema chama de
"recibo"), outros exigem **Nota Fiscal** (NFS-e — emissão real ainda não
existe, é o item 7, separado). Este spec troca o boolean por uma escolha
de tipo, sem construir nenhuma emissão de nota fiscal ainda.

## Modelo de dados

Migration em `Paciente`:

```sql
alter table public."Paciente"
  add column documento text check (documento in ('recibo', 'nota_fiscal'));

update public."Paciente" set documento = 'recibo' where precisa_recibo = true;

alter table public."Paciente" drop column precisa_recibo;
```

- `documento` é `nullable`, sem default — vazio (`null`) é um estado
  válido e é o padrão pra paciente novo, significando "nenhum documento".
  Pacientes com `documento is null` ficam de fora de qualquer geração em
  lote hoje ou no futuro (itens 8/9 do backlog, TXT do Carnê-Leão) —
  decisão explícita do usuário.
- Valores internos (`recibo`, `nota_fiscal`) não usam os nomes de
  exibição ("Receita Saúde", "Nota Fiscal") de propósito: `'recibo'`
  mapeia diretamente pra tabela `Recibo`, onde a emissão de verdade é
  gravada — mantém o código e o nome do valor alinhados.
- `precisa_recibo` é removida na mesma migration — nenhum código
  continua lendo/escrevendo nela depois desta entrega.

## Cadastro de paciente (`PacienteForm.js`)

Troca o checkbox "Precisa de recibo" por um `<select name="documento">`:

```jsx
<option value="">Nenhum</option>
<option value="recibo">Receita Saúde</option>
<option value="nota_fiscal">Nota Fiscal</option>
```

`dadosDoFormulario` (`lib/actions/pacientes.js`) passa a ler
`documento: formData.get("documento") || null` no lugar do boolean.

## Tela `/recibos`

**Sem mudança de comportamento ou de nome nesta entrega** — decisão
explícita do usuário: como a emissão de Nota Fiscal ainda não existe
(item 7), a tela continua só lidando com Receita Saúde. Pacientes com
`documento = 'nota_fiscal'` não aparecem em `/recibos` (nem em nenhuma
lista de automação futura), mas continuam aparecendo normalmente no
cadastro/listagem de pacientes — não há nenhuma tela que os esconda.

Mudanças mecânicas em `lib/data/recibos.js`:
- `listarSessoesElegiveisParaRecibo()`: troca `.eq("Paciente.precisa_recibo", true)` por `.eq("Paciente.documento", "recibo")`, e o campo buscado no embed (`precisa_recibo` → `documento`).
- Texto do estado vazio em `app/(app)/(gestao)/recibos/page.js` ("Precisa de recibo" → "Documento = Receita Saúde").

## Import por planilha

A coluna de mapeamento "Precisa de recibo" (`CAMPOS` em
`ImportarPacientesWizard.js`) vira "Documento", aceitando texto livre na
célula, com o mesmo padrão de tolerância a variações já usado nos outros
campos do import (`parsearRecibo`, `parsearData` etc. em
`lib/actions/importar-pacientes.js`):

```js
function parsearDocumento(texto) {
  const normalizado = (texto ?? "").trim().toLowerCase();
  if (["receita saude", "receita saúde", "recibo"].includes(normalizado)) return "recibo";
  if (["nota fiscal", "nf", "nota"].includes(normalizado)) return "nota_fiscal";
  return null;
}
```

Célula vazia ou não reconhecida vira `null` (nenhum documento) — sem
aviso na linha, mesmo padrão hoje usado pra `telefone`/`endereco` (campo
livre, sem formato obrigatório).

Planilha modelo (`web/scripts/gerar-planilha-modelo-pacientes.mjs`):
coluna "Precisa de recibo" (valor exemplo "Sim") vira "Documento" (valor
exemplo "Receita Saúde").

## Fora de escopo

- Qualquer emissão real de Nota Fiscal (item 7, separado).
- Mudar o nome/rótulo da tela `/recibos` — só muda quando o item 7
  trouxer uma ação de verdade pra Nota Fiscal.
- TXT do Carnê-Leão e rotina automática (itens 8/9) — este spec só
  garante que `documento = 'nota_fiscal'`/`null` ficam de fora quando
  esses itens existirem, não implementa a geração em si.
