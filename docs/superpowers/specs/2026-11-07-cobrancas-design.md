# Cobranças — agrupar sessões e receber de uma vez

## Intenção

No início do mês o profissional precisa levar a cada paciente o valor a pagar pelas sessões
do mês anterior. Hoje o sistema só sabe receber (um recebimento em lote por paciente, em
`/pacientes/[id]/receber`): não existe uma etapa anterior em que as sessões são agrupadas,
o valor é fechado e o tipo de documento (recibo ou nota fiscal) é definido. A Cobrança é
essa etapa. Ela convive com o recebimento em lote atual, que continua existindo como
outra forma de trabalhar.

## Objetivos

- Entidade **Cobrança**: agrupa sessões de um mesmo paciente, tem valor total, tipo de
  documento (`nenhum` / `recibo` / `nota_fiscal`) e situação (`aberta` / `recebida` /
  `cancelada`).
- **Tela "Cobranças"** no menu principal: lista de cobranças criadas (filtros por situação,
  período e paciente) e detalhe de cada uma com as sessões incluídas, o documento e o
  pagamento.
- **Tela "Nova cobrança"** (rotina do início do mês): escolhe o mês, vê os pacientes com
  sessões ainda não cobradas (com contagem e valor), marca os pacientes e cria uma cobrança
  por paciente marcado, escolhendo o tipo de documento de cada uma.
- **Aba "Cobranças" no detalhe do paciente**: lista as sessões do paciente ainda não
  vinculadas a uma cobrança; ao marcar e agrupar, cria a cobrança e as sessões passam a
  aparecer como **Cobrada**. A aba também lista as cobranças do paciente.
- **Receber cobrança**: botão no detalhe da cobrança e na aba do paciente (e na lista).
  Pergunta a data do recebimento e a conta; ao confirmar, registra o recebimento de todas
  as sessões da cobrança e marca a cobrança como recebida.

## Não-objetivos

- Não envia nada ao paciente (WhatsApp, e-mail, PDF). O sistema calcula e registra; o
  profissional manda o valor do jeito dele. (Escolha minha: o usuário não respondeu se
  queria envio; envio fica para uma v2.)
- Não emite recibo nem NFS-e automaticamente ao receber. O tipo de documento fica
  registrado e, depois de recebida, o detalhe leva às telas existentes (`/recibos`,
  `/notas-fiscais`), que já enxergam o recebimento. (Escolha minha.)
- Sem recebimento parcial de cobrança, sem cobrança misturando pacientes, sem gateway,
  boleto ou Pix (itens 15/31 do backlog tratam disso).
- Não substitui nem altera o recebimento individual e em lote que já existem.

## Decisões do usuário

1. A Cobrança é uma segunda forma de trabalhar, além do recebimento em lote.
2. Fluxo mensal: no início do mês agrupar as sessões do mês anterior por paciente.
3. Telas: "Cobranças" no menu principal, aba "Cobranças" no paciente (ver e criar),
   botão de receber nas duas, que pergunta data do recebimento e conta.
4. A cobrança define o tipo de documento a ser criado.
5. Ao agrupar, as sessões passam a "Cobrada".

## Desenho técnico (base no que já existe)

Modelo atual relevante: `Sessao` (`status` de comparecimento: Marcada/Realizada/Cancelada,
`valor`), `Recebimento` + `RecebimentoSessao(valor_aplicado)` (migration
`20260829000003`), `LancamentoFinanceiro`. O saldo devedor de uma sessão é
`valor − sum(valor_aplicado)`. NFS-e e Carnê-Leão já leem `RecebimentoSessao`; Recibo lê
`Sessao`. Receber hoje = `criarRecebimento` (`web/lib/recebimento.js`), usado por
`web/lib/actions/recebimentos.js`.

- **"Cobrada" é derivada, não um novo `Sessao.status`.** `Sessao.status` é comparecimento;
  misturar cobrança ali quebraria filtros e cores da agenda. A sessão é "Cobrada" quando
  existe um vínculo ativo dela com uma cobrança `aberta`; vira "Paga" pelo saldo, como hoje.
  (Escolha minha, em conflito aparente com a palavra "status" do pedido; o efeito visível
  para o profissional é o mesmo: selo "Cobrada" nas sessões.)
- **Tabelas novas** (RLS no padrão do projeto, escopo por owner): `Cobranca` (owner,
  paciente, responsavel_financeiro, periodo_referencia date nullable, valor_total,
  tipo_documento, situacao, recebimento nullable, criada_em, recebida_em) e
  `CobrancaSessao` (cobranca, sessao **única** — uma sessão só pode estar em uma cobrança
  ativa —, valor congelado no momento da criação).
- **Sessões elegíveis** para cobrar: `status` ≠ Cancelada, sem vínculo ativo, saldo
  devedor > 0. Na tela "Nova cobrança" vêm marcadas por padrão só as Realizadas; Marcadas
  aparecem desmarcadas. (Escolha minha.)
- **Receber**: reusa a lógica de `criarRecebimento` com as sessões da cobrança e o valor
  congelado; precisa ser **atômico** (hoje o fluxo faz inserts em chamadas separadas;
  para dinheiro, preferir uma função SQL transacional — decisão do construtor, é o ponto
  de maior risco). Além de data e conta (pedidas pelo usuário), a forma de pagamento é
  obrigatória em `Recebimento`: o modal pergunta também a forma (escolha minha).
- **Cancelar cobrança `aberta`**: libera as sessões. Cobrança `recebida` não se cancela
  nesta versão.
- **Conflito com os outros caminhos de recebimento**: uma sessão em cobrança `aberta` não
  pode ser recebida pelo fluxo individual/lote/crédito (mensagem orientando a receber pela
  cobrança); da mesma forma, enquanto estiver em cobrança `aberta`, a sessão não pode ser
  cancelada, excluída nem ter o valor alterado. O construtor deve revisar **todos** os
  caminhos que escrevem recebimento ou alteram sessão, incluindo as RPCs do agente de
  WhatsApp (`agent_registrar_pagamento` etc.).
- **Menu e acesso**: item "Cobranças" no menu principal, dentro do grupo de gestão
  (planos sem gestão, como o Psi Marketing, não veem).
- **Padrão de documento**: o tipo vem pré-selecionado do `Paciente.documento`
  (Nenhum / Receita Saúde / Nota Fiscal) e pode ser trocado por cobrança.

## Deixado ao construtor

Layout fino das telas (os rascunhos mostrados ao usuário são só referência), filtros da
lista, formato de data de período, nomes de colunas/rotas, estratégia de transação
(RPC ou outra), textos de erro.

## Verificação

Sem framework de testes no projeto: lógica pura (elegibilidade, totais) com `node --test`
como no item 22; resto verificado ponta a ponta contra produção com dados descartáveis
(criar cobrança, receber, cancelar, conflito com recebimento individual).

## Resoluções da revisão do construtor

Decisões minhas (marcadas; o usuário pode reverter):
- **Valor congelado = saldo devedor** da sessão no momento da criação (`valor` da sessão
  menos o já aplicado em `RecebimentoSessao`). Assim uma sessão com pagamento parcial entra
  pelo que falta, e o `valor_total` da cobrança é a soma dos saldos. Receber aplica
  exatamente esses valores. Crédito antecipado não entra na cobrança (consumo de crédito
  pelos fluxos existentes fica bloqueado para sessão em cobrança aberta).
- **Período**: a tela "Nova cobrança" filtra por `Sessao.data` dentro do mês civil
  escolhido (coluna `date`, sem problema de fuso) e preenche `periodo_referencia`
  (primeiro dia do mês). Cobrança criada pela aba do paciente aceita sessões de qualquer
  data e deixa `periodo_referencia` nulo. O filtro de período da lista usa
  `periodo_referencia` quando existe e, senão, as datas das sessões.
- **Responsável financeiro**: o mesmo que o fluxo de recebimento em lote já usa (o
  construtor lê `registrarRecebimentoLote`; se o paciente tiver mais de um, o formulário de
  criação pergunta, como hoje). Fica gravado na cobrança.
- **Recebimento estornado depois**: se um fluxo existente excluir ou estornar um
  `Recebimento` ligado a uma cobrança `recebida`, a cobrança volta a `aberta` (vínculo
  `recebimento` vira nulo). O construtor confere se esse fluxo existe e como.
- **Tipo de documento**: `Paciente.documento` mapeia Nenhum→`nenhum`, Receita
  Saúde→`recibo`, Nota Fiscal→`nota_fiscal`. O tipo é só um rótulo da cobrança, disponível
  em qualquer plano; a trava por plano da NFS-e continua em `/notas-fiscais`.
- **Unicidade e concorrência**: `CobrancaSessao` ganha `ativa boolean`; índice único
  parcial em `(sessao) where ativa`. Cancelar a cobrança marca `ativa = false`
  (preserva o histórico). Duplo clique ou duas abas: a segunda criação falha na
  constraint e a ação mostra mensagem amigável, sem duplicar.
- **Bloqueio**: aplicado no app e, para o que for dinheiro (receber fora da cobrança),
  também no banco (trigger ou checagem na função SQL de receber), para as RPCs do agente
  não furarem a regra.

Pendente do usuário (uma pergunta): comportamento do agente de WhatsApp e dos fluxos
individuais quando o paciente paga uma sessão que já está em cobrança aberta.
