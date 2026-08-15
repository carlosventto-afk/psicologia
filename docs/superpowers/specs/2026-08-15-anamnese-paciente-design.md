# Segmento "Anamnese" no cadastro do paciente

Status: aprovado para plano de implementação
Data: 2026-08-15
Pedido do usuário, item 12 do backlog (`docs/backlog-novas-funcionalidades.md`).

## Objetivo

Hoje o cadastro do paciente (`Paciente`) só tem dados cadastrais/financeiros
(contato, CPF/RG, valor da sessão, responsável financeiro). Não existe nenhum
campo clínico. Este item adiciona uma aba "Anamnese" na página de detalhe do
paciente, com dados relevantes pra prática da psicologia, e um histórico de
atualizações (o profissional precisa poder acompanhar a evolução do paciente
e consultar informações antigas, não só o estado atual).

## Campos estruturados (v1, todos opcionais, texto livre)

1. Medicação em uso (nome + dosagem, texto livre)
2. Médico responsável (nome)
3. Desde quando faz terapia (em geral)
4. Desde quando é atendido por este profissional
5. Queixa inicial
6. Desenvolvimento/evolução da queixa
7. Histórico familiar relevante
8. Tratamento psicológico/psiquiátrico anterior
9. Uso de substâncias
10. Hipótese diagnóstica / comorbidades
11. Expectativas do paciente com o processo terapêutico

## Modelo de dados

### `Anamnese` (1:1 com `Paciente`)

Criada só quando o profissional salva algo pela primeira vez — não existe
automaticamente para todo paciente.

- `id bigint` PK
- `paciente bigint unique not null references "Paciente"(id) on delete cascade`
- os 11 campos acima, todos `text`, nullable
- `atualizado_em timestamptz not null default now()`

Sem coluna `owner` própria. RLS escopada via join a `Paciente.owner`, no
mesmo padrão já usado por `PagamentoSessao` (que escopa via `Sessao.owner`
em `supabase/migrations/20260727000003_enable_rls_policies.sql`).

### `AnamneseFollowup` (histórico, append-only)

Nunca é editada ou apagada pela aplicação — cada linha é um evento imutável
na timeline.

- `id bigint` PK
- `anamnese bigint not null references "Anamnese"(id) on delete cascade`
- `criado_em timestamptz not null default now()`
- `observacao text` — nota livre da atualização, independente de os campos
  estruturados terem mudado ou não
- `alteracoes jsonb not null default '[]'` — array de
  `{ "campo": "queixa_inicial", "valor_anterior": "...", "valor_novo": "..." }`,
  só com os campos que de fato mudaram naquele salvamento

RLS via join `AnamneseFollowup → Anamnese → Paciente → owner` (mesmo padrão
em cadeia).

**Por que jsonb e não uma tabela normalizada por campo alterado:** o volume
por paciente é baixo (poucos followups ao longo de um tratamento, não um
sistema de auditoria de alto volume) e não há necessidade hoje de consultar
"todos os followups que mudaram o campo X entre todos os pacientes" — um
array por evento é mais simples de gerar e renderizar na timeline sem juntar
linhas. Se essa necessidade aparecer depois, dá pra normalizar então.

## Fluxo de salvar (server action `salvarAnamnese`)

1. Carrega a `Anamnese` atual do paciente, se existir.
2. Compara cada um dos 11 campos (valor atual no banco vs. valor novo do
   formulário) e monta `alteracoes` só com os que mudaram.
3. `upsert` na `Anamnese` (por `paciente`) com os novos valores +
   `atualizado_em = now()`.
4. Insere uma linha em `AnamneseFollowup` **se** `alteracoes.length > 0`
   **ou** a observação da atualização veio preenchida. Se o profissional
   abrir o formulário e salvar sem mudar nada e sem escrever observação,
   nenhum followup é criado (evita ruído na timeline).
5. No primeiro salvamento (não existia `Anamnese` antes), todo campo
   preenchido entra em `alteracoes` com `valor_anterior: null` — a timeline
   nasce com um evento inicial "anamnese registrada".

Segue o mesmo padrão de `atualizarPaciente`
(`web/lib/actions/pacientes.js`): action recebe `(pacienteId, prevState,
formData)`, retorna `{ error }` em falha de banco, sem validação de campo
obrigatório (os 11 campos e a observação são opcionais), termina com
`revalidatePath` + `redirect` de volta pra aba Anamnese.

## UI

### Abas em `/pacientes/[id]`

A página de detalhe ganha abas por query param — `?aba=dados` (default),
`?aba=anamnese`, `?aba=sessoes` — usando `Link` server-rendered, sem estado
client-side, consistente com o padrão de filtro por `searchParams` já usado
em `/financeiro/lancamentos`, `/carne-leao` etc.

- **Dados** — o card atual (telefone, e-mail, nascimento, valor, CPF/RG,
  responsável financeiro, observações), inalterado.
- **Sessões** — a listagem de sessões atual, inalterada.
- **Anamnese** (nova):
  - Se não existe `Anamnese` pro paciente: "Nenhuma anamnese registrada
    ainda." + botão "Registrar anamnese".
  - Se existe: os 11 campos com os valores atuais + botão "Editar
    anamnese".
  - Botão abre `/pacientes/[id]/anamnese/editar`: formulário com os 11
    campos pré-preenchidos (`textarea`, já que são todos texto livre e
    alguns podem ser longos, ex. desenvolvimento da queixa) + um campo
    "Observação desta atualização" (sempre em branco, é por evento).
  - Abaixo dos valores atuais, timeline dos followups (mais recente
    primeiro): data/hora, observação (se houver), e a lista `campo: valor
    antigo → valor novo` dos campos alterados naquele evento. Followup sem
    nenhuma alteração de campo (só observação) mostra só a observação.

### Novos arquivos

- `web/components/AnamneseForm.js` — formulário de edição (padrão de
  `PacienteForm.js`).
- `web/lib/data/anamnese.js` — `buscarAnamnese(pacienteId)`,
  `listarFollowupsAnamnese(pacienteId)`.
- `web/lib/actions/anamnese.js` — `salvarAnamnese(pacienteId, prevState,
  formData)`.
- `web/app/(app)/(gestao)/pacientes/[id]/anamnese/editar/page.js` — página
  do formulário.
- Migration nova em `supabase/migrations/` criando `Anamnese` e
  `AnamneseFollowup` + RLS.

### Arquivos alterados

- `web/app/(app)/(gestao)/pacientes/[id]/page.js` — vira abas; conteúdo
  atual some para dentro da aba "Dados"/"Sessões", nova aba "Anamnese"
  busca `buscarAnamnese` + `listarFollowupsAnamnese`.

## Erros

Mesmo padrão do resto do app: a action retorna `{ error: "Não foi possível
salvar a anamnese." }` em falha de banco; sem validação de obrigatoriedade.
Não há tratamento de concorrência (dois salvamentos simultâneos do mesmo
paciente) — não é um risco relevante nesse app (um profissional edita o
próprio paciente, não há edição colaborativa).

**Falha parcial (upsert ok, insert do followup falha):** o `upsert` em `Anamnese`
e o `insert` em `AnamneseFollowup` são duas chamadas independentes, sem
transação. Se a segunda falhar (ex: timeout de rede — não há como uma policy
de RLS rejeitar essa segunda chamada já que a mesma sessão acabou de escrever
a linha pai, nem violar constraint), o usuário recebe o erro genérico e pode
tentar de novo — mas o retry recalcula o diff contra a `Anamnese` já
atualizada, então sem uma observação escrita o retry não gera alteracoes
nenhuma e o evento de histórico se perde silenciosamente, sem sinalizar nada
a ninguém. Aceito para v1 (baixa probabilidade, sem risco de corrupção de
dado, só de uma lacuna no histórico) — se isso vier a ser um problema real,
envolver as duas escritas numa função transacional (mesmo padrão de
`registrar_nota_fiscal_pendente` pra numeração de NFS-e).

## Testes

Projeto não tem suíte automatizada (nenhum `*.test.js` fora de
`node_modules`) — verificação é manual via build + preview local, mesmo
padrão dos itens anteriores do backlog. Roteiro de verificação end-to-end:

1. Criar anamnese pela primeira vez num paciente sem anamnese — confere
   que aparece na aba, com um followup inicial na timeline.
2. Editar um campo só, salvar sem observação — confere que o followup
   mostra só o campo mudado.
3. Editar sem mudar nada e sem observação — confere que **não** cria
   followup novo.
4. Salvar só com observação, sem mudar campos — confere que cria followup
   só com a observação.
5. RLS: paciente de outro profissional não deve expor anamnese/followups
   (testar com dois usuários, ou revisar a policy por inspeção de SQL).
