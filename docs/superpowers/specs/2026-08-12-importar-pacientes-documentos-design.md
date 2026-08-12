# Importação de pacientes: campos de documento (CPF/RG)

## Contexto

A importação de pacientes via planilha (`ImportarPacientesWizard.js` +
`lib/actions/importar-pacientes.js`) foi implementada antes dos campos de
documento (`cpf`, `rg_numero`, `rg_data_expedicao`, `rg_orgao_emissor`)
existirem no cadastro de paciente. Esta mudança estende o import pra
cobrir esses 4 campos e atualiza a planilha modelo.

`dependente`/`responsavel_financeiro` ficam de fora por decisão explícita:
o import não precisa suportar esse relacionamento — pacientes importados
nascem `dependente = false` (padrão do banco), igual já acontece hoje com
pacientes criados manualmente sem marcar o checkbox. Isso evita o problema
de referenciar outro paciente por texto livre numa planilha, que o spec
original desta feature já havia rejeitado para Consultório/Pacote pelo
mesmo motivo (ambiguidade de matching por nome).

## Mudanças

**`web/components/ImportarPacientesWizard.js`** — `CAMPOS` ganha 4
entradas novas, todas `obrigatorio: false`, seguindo o mesmo formato das
existentes:

```js
{ chave: "cpf", rotulo: "CPF", obrigatorio: false, aliases: ["cpf"] },
{ chave: "rg_numero", rotulo: "RG - Número", obrigatorio: false,
  aliases: ["rg", "rg numero", "rg - numero", "numero do rg"] },
{ chave: "rg_data_expedicao", rotulo: "Data de Expedição (RG)", obrigatorio: false,
  aliases: ["data de expedicao", "data de expedição", "expedicao rg"] },
{ chave: "rg_orgao_emissor", rotulo: "Órgão Emissor (RG)", obrigatorio: false,
  aliases: ["orgao emissor", "órgão emissor", "emissor"] },
```

**`web/lib/actions/importar-pacientes.js`** — dentro do loop de
processamento de cada linha:
- `cpf`, `rg_numero`, `rg_orgao_emissor`: texto livre, `.trim() || null`,
  sem validação — mesmo tratamento já dado a `telefone`/`endereco`.
- `rg_data_expedicao`: reaproveita a função `parsearData()` já usada para
  `data_nascimento` (aceita `D/M/YYYY` ou `DD/MM/YYYY`; se a célula não
  estiver vazia mas o formato for inválido, o campo vira `null` e um
  aviso é adicionado a `relatorio.avisos` — a linha continua sendo
  importada normalmente, sem bloquear).
- Os 4 campos entram no objeto de insert enviado para `Paciente`, junto
  dos campos já existentes.
- `dependente` e `responsavel_financeiro` não são tocados — ficam no
  valor padrão do banco (`false` / `null`).

**`web/scripts/gerar-planilha-modelo-pacientes.mjs`** — `cabecalho` ganha
as 4 colunas novas (na mesma ordem do `CAMPOS` atualizado, ao final da
lista atual) e a linha de exemplo ganha valores plausíveis para elas. O
script é executado para regenerar `web/public/planilha-modelo-pacientes.xlsx`
(arquivo binário publicado, não é gerado em runtime).

## Fora de escopo

- `dependente`/`responsavel_financeiro` na planilha (decisão explícita,
  ver Contexto).
- Validação de dígito verificador de CPF (já fora de escopo no cadastro
  manual, mantido consistente aqui).
- Qualquer lookup de paciente existente por CPF (ex.: usar CPF para
  detectar duplicados) — a deduplicação continua sendo só por nome
  normalizado, como já funciona hoje.
