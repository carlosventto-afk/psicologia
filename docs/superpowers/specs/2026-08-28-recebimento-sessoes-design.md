# Gestão de Recebimentos de Sessão

> **Status:** design aprovado. Falta apenas a autorrevisão e a revisão final
> do usuário antes de seguir para o plano de implementação.

## Contexto

Hoje o recebimento de sessão é sempre 1 sessão : 1 pagamento
(`PagamentoSessao`, ver `web/lib/pagamento-sessao.js`), sem suporte a:

1. Botão de receber a partir da Ficha do Paciente (só existe na Agenda e em
   Financeiro > Inadimplentes).
2. Receber o valor de sessões futuras já lançadas na agenda, ou adiantar
   valor para sessões que **ainda não existem** na agenda (crédito).
3. Receber sessões já ocorridas (existe hoje, mas 1 a 1).
4. Mais de um responsável financeiro por paciente (hoje é um campo único
   `Paciente.responsavel_financeiro`, self-FK — ver
   [2026-08-11-documentos-dependente-responsavel-financeiro-design.md](2026-08-11-documentos-dependente-responsavel-financeiro-design.md)),
   com relatório de responsáveis que pagam por mais de um paciente.
5. Valor cobrado gravado na própria sessão (hoje `Sessao` não tem campo de
   valor — é sempre herdado via join de `Paciente.valor_sessao`).

Este documento substitui o modelo de responsável financeiro do design de
2026-08-11 (self-FK em `Paciente`) por uma entidade própria, e substitui
`PagamentoSessao` por um modelo cabeçalho/detalhe (`Recebimento` +
`RecebimentoSessao`).

**Nomenclatura:** o termo "Pagamento" (visão do cliente) é substituído por
"Recebimento" (visão do profissional) em todo o sistema — tabelas, rotas e
textos de UI.

## Modelo de dados

### Responsável financeiro (substitui o self-FK em `Paciente`)

```
ResponsavelFinanceiro
  id, nome, cpf_cnpj, telefone, email,
  paciente_vinculado  -- FK opcional -> Paciente.id, quando o responsável
                       -- também é um paciente cadastrado (ex.: mãe que
                       -- também faz terapia). Nulo para responsáveis
                       -- avulsos (empresa, convênio, parente sem sessão
                       -- própria).

PacienteResponsavelFinanceiro  -- N:N
  paciente_id, responsavel_id
```

- Um paciente pode ter vários responsáveis vinculados (ex.: pai e mãe).
- Um responsável pode estar vinculado a vários pacientes (base do
  relatório do item 4).
- **Migração do modelo antigo:** para todo `Paciente` com `dependente =
  true` e `responsavel_financeiro` preenchido, criar um
  `ResponsavelFinanceiro` com `paciente_vinculado` apontando para o
  paciente que hoje é o responsável (reaproveitando nome/telefone/email
  dele), e uma linha em `PacienteResponsavelFinanceiro` ligando o
  dependente a esse responsável. Os campos `dependente` e
  `responsavel_financeiro` em `Paciente` ficam obsoletos após a migração
  (decidir na hora de implementar: remover ou manter por compatibilidade
  de exibição em recibos já emitidos).

### Valor da sessão

```
Sessao
  + valor  numeric  -- default = Paciente.valor_sessao no momento da
                     -- criação da sessão; editável depois, por sessão.
```

- Backfill: todas as sessões existentes recebem `valor =
  Paciente.valor_sessao` atual do paciente vinculado.
- O valor cobrado numa sessão passa a ser sempre `Sessao.valor` — o
  cadastro do paciente (`Paciente.valor_sessao`) vira só o valor
  *default* para sessões novas, sem efeito retroativo sobre sessões já
  criadas.

### Recebimento (substitui `PagamentoSessao`)

```
Recebimento
  id, responsavel_financeiro_id, paciente_id,
  data_recebimento, valor_total, forma_pagamento, conta_id,
  lancamento_financeiro_id

RecebimentoSessao  -- alocação, 1:N a partir de Recebimento
  id, recebimento_id, sessao_id,
  valor_aplicado  -- snapshot do Sessao.valor no momento da alocação
```

- **Sem pagamento parcial**: um `Recebimento` que já tem sessões
  selecionadas no momento da criação sempre cobre o valor cheio delas
  (`valor_total` = soma das sessões marcadas). Não existe recebimento
  "menor que o total" quando há sessões já selecionadas.
- **Crédito/adiantamento**: um `Recebimento` pode ser criado **sem
  nenhuma sessão alocada** (`RecebimentoSessao` vazio) — usado para
  adiantar valor de sessões que ainda não existem na agenda. Nesse caso
  `valor_total` inteiro fica como saldo disponível.
- **Saldo de crédito** de um `Recebimento` = `valor_total - soma(
  RecebimentoSessao.valor_aplicado)`. Enquanto > 0, aparece como crédito
  disponível do paciente.
- **Contabilização**: o `LancamentoFinanceiro` (Receita) é criado junto
  com o `Recebimento`, pelo valor total, no momento em que o dinheiro
  entra — independente de já haver sessões alocadas. A alocação
  posterior de crédito a uma sessão (`RecebimentoSessao`) **não** gera
  novo lançamento financeiro, é só marcação de quitação. Isso é
  consistente com o comportamento já existente hoje (receita reconhecida
  na data do pagamento, não na data da sessão).
- Uma sessão é considerada **recebida/quitada** quando a soma de
  `RecebimentoSessao.valor_aplicado` vinculada a ela cobre
  `Sessao.valor`.
- A regra de "Inadimplentes" em `listarInadimplentes()`
  (`web/lib/data/financeiro.js`) passa de "sessão Realizado sem
  `PagamentoSessao`" para "sessão Realizado com soma de
  `RecebimentoSessao.valor_aplicado` < `Sessao.valor`".

## Fluxos de tela

### A) Recebimento individual (evolução do fluxo atual)

Botão "Receber" (renomeado de "Registrar Pagamento") já existe na Agenda
e passa a existir também na aba "Sessões" da Ficha do Paciente
(`web/app/(app)/(gestao)/pacientes/[id]/page.js`), para cada sessão sem
quitação total. Ao abrir, o formulário passa a exigir escolher o
**responsável financeiro** (select filtrado pelos vinculados a esse
paciente via `PacienteResponsavelFinanceiro`; auto-seleciona se só houver
um). Valor vem de `Sessao.valor`, não editável nesse momento (edição de
valor é ação da própria sessão, não do recebimento).

### B) Recebimento em lote (cobre sessões passadas e futuras já lançadas)

Nova ação "Receber sessões" na Ficha do Paciente: lista todas as sessões
sem quitação total do paciente — passadas realizadas **e** futuras
marcadas — cada uma com checkbox e valor. Ao marcar, o sistema soma o
total automaticamente. Usuário escolhe responsável financeiro, forma de
pagamento e conta, confirma → gera 1 `Recebimento` (valor_total = soma)
+ N `RecebimentoSessao` (uma por sessão marcada, valor_aplicado = valor
de cada sessão).

### C) Recebimento antecipado / crédito (sessões que ainda não existem)

Na mesma tela do fluxo B, opção de confirmar **sem marcar nenhuma
sessão** — gera o `Recebimento` com valor recebido mas
`RecebimentoSessao` vazio (crédito integral disponível). A Ficha do
Paciente exibe "Crédito disponível: R$ X" quando houver saldo não
alocado de algum `Recebimento`.

Quando uma sessão desse paciente é criada (avulsa, recorrência, ou
marcada como realizada) e há crédito disponível, o sistema exibe um
aviso ("Há R$X de crédito disponível — usar para quitar esta sessão?")
com botão de confirmação — **consumo não é automático/silencioso**, para
evitar alocação errada quando há mais de um responsável financeiro
ativo para o mesmo paciente.

## Cadastro e relatório de responsável financeiro

Nova tela "Responsáveis Financeiros" (lista + criar/editar):

- Ao criar, duas opções: "vincular a um paciente já cadastrado" (busca
  por nome, preenche `paciente_vinculado`, permite CPF próprio) ou "novo
  responsável avulso" (nome, CPF/CNPJ, telefone, email livres).
- Lista mostra coluna "nº de pacientes vinculados", destacando quem tem
  mais de um (relatório pedido no item 4).
- Clicar num responsável mostra os pacientes vinculados e o histórico de
  recebimentos feitos por ele.
- Na Ficha do Paciente, nova sub-seção "Responsáveis Financeiros" para
  vincular/desvincular via N:N (buscar responsável existente ou criar
  ali mesmo).

## Nomenclatura (rename)

- `PagamentoSessao` → extinta, substituída por `Recebimento` /
  `RecebimentoSessao`.
- "Registrar Pagamento" → "Receber"; "Pagamento de Sessão" →
  "Recebimento de Sessão".
- Rota `/sessoes/[id]/pagamento` → `/sessoes/[id]/receber`.

## Regras de negócio adicionais

- **Exclusão/cancelamento de sessão com recebimento já aplicado**:
  bloqueado. Para excluir ou cancelar uma `Sessao` que já tem
  `RecebimentoSessao` vinculado, é preciso primeiro desfazer a alocação
  daquela sessão no recebimento (o que devolve o valor como crédito
  disponível no `Recebimento` de origem) — só então a exclusão/
  cancelamento é permitido.

## Fora de escopo (nesta rodada)

- Pagamento parcial de sessões já selecionadas (valor sempre cheio).
- Geração de PDF/documento de recibo usando os dados do responsável
  financeiro (recibo continua sendo só registro de emissão, como hoje).
- Consumo automático/silencioso de crédito sem confirmação do usuário.

## Questões em aberto

1. Decidir, na implementação, se os campos antigos `Paciente.dependente`
   e `Paciente.responsavel_financeiro` são removidos após a migração de
   dados ou mantidos (ex.: por serem referenciados em recibos já
   emitidos).
