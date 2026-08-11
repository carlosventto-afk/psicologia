# Documentos do paciente + Dependente/Responsável financeiro

## Contexto

O cadastro de paciente (`Paciente`) não tem nenhum campo de documento (CPF,
identidade), e não existe o conceito de "responsável financeiro" separado do
paciente. Isso é necessário para dois casos de uso: (1) registrar CPF/RG do
paciente para uso futuro em documentos (recibos/notas), e (2) casos onde o
paciente não é quem paga — ex.: uma criança ou um adulto financeiramente
dependente de outra pessoa, que é quem deve aparecer como responsável na
emissão de recibo/nota.

## Modelo de dados

Migration em `Paciente`:

```sql
alter table public."Paciente"
  add column cpf text,
  add column rg_numero text,
  add column rg_data_expedicao date,
  add column rg_orgao_emissor text,
  add column dependente boolean not null default false,
  add column responsavel_financeiro bigint references public."Paciente"(id);

alter table public."Paciente"
  add constraint paciente_dependente_precisa_responsavel
    check (dependente = false or responsavel_financeiro is not null);

alter table public."Paciente"
  add constraint paciente_responsavel_nao_pode_ser_proprio
    check (responsavel_financeiro is null or responsavel_financeiro <> id);
```

- CPF e os três campos de identidade (`rg_numero`, `rg_data_expedicao`,
  `rg_orgao_emissor`) são **opcionais e independentes entre si** — não há
  obrigatoriedade de preencher nenhum, nem de preencher os três juntos.
- `dependente` nasce `false` para todo paciente (novo ou existente).
- `responsavel_financeiro` é uma auto-referência à própria tabela
  `Paciente`. Um paciente escolhido como responsável financeiro de outro
  **pode ele mesmo ser dependente de uma terceira pessoa** — não há
  restrição de cadeia (A depende de B que depende de C é permitido).
- Sem `on delete` explícito (padrão `NO ACTION`): não é possível excluir
  um paciente enquanto ele ainda for o responsável financeiro de algum
  dependente ativo — a exclusão só é permitida depois que os
  dependentes forem reatribuídos a outra pessoa ou desmarcados. Isso
  evita o caso de um `SET NULL` automático violar a constraint
  `paciente_dependente_precisa_responsavel` (um dependente não pode
  ficar sem responsável). Não há tela de exclusão de paciente hoje, mas
  a policy `paciente_delete_own` já existe no banco, então essa regra
  vale para qualquer exclusão futura, via UI ou API direta.
- As duas constraints `check` são a rede de segurança no banco; a mesma
  regra também é validada na Server Action (mensagem de erro amigável) e
  o `<select>` de responsável financeiro no formulário nunca lista o
  próprio paciente.

## Formulário de cadastro (`PacienteForm.js`)

Duas seções novas:

**Documentos**
- Campo `cpf` (texto livre, sem máscara/validação de dígito — mesmo
  padrão do campo `telefone` existente).
- Bloco "Identidade" com três campos lado a lado: `rg_numero` (texto),
  `rg_data_expedicao` (date), `rg_orgao_emissor` (texto).

**Responsável financeiro**
- Checkbox "Este paciente é dependente de outra pessoa" (`dependente`),
  desmarcado por padrão.
- Ao marcar, revela um `<select name="responsavel_financeiro">`
  carregado a partir de `listarPacientesParaSelect(excluirId)` — lista
  todos os pacientes do profissional exceto o próprio (na tela de
  edição; na tela de criação não há id próprio ainda, então lista todos).
- Ao desmarcar o checkbox, o valor selecionado é descartado no submit
  (paciente volta a ser responsável por si mesmo) — tratado no cliente
  (não enviar `responsavel_financeiro` quando `dependente` estiver
  desmarcado) e reforçado na Server Action (zera o campo se
  `dependente` vier falso, independente do que foi enviado).

**Validação na Server Action** (`criarPaciente`/`atualizarPaciente` em
`lib/actions/pacientes.js`): se `dependente` for verdadeiro e nenhum
`responsavel_financeiro` foi selecionado, retorna
`{ error: "Selecione o responsável financeiro." }` sem chegar a tocar o
banco (a constraint do banco é a rede de segurança, não o caminho normal
de erro).

## Leitura (`lib/data/pacientes.js`)

- `buscarPaciente(id)`: passa a selecionar também `cpf, rg_numero,
  rg_data_expedicao, rg_orgao_emissor, dependente, responsavel_financeiro`
  e um embed do nome do responsável
  (`ResponsavelFinanceiro:Paciente!Paciente_responsavel_financeiro_fkey(nome)`)
  para pré-popular o formulário de edição e exibir na ficha do paciente
  (`/pacientes/[id]`).
- `listarPacientesParaSelect(excluirId)`: novo parâmetro opcional; quando
  presente, filtra `.neq("id", excluirId)`.

## Exibição em Recibos e Financeiro

Regra visual única, usada nas três listagens abaixo: quando o paciente
da sessão/recibo é `dependente`, mostrar
`{nome do paciente} (dependente de {nome do responsável})`; quando não é
dependente, mostrar só o nome do paciente (comportamento atual,
inalterado).

- `lib/data/recibos.js` → `listarSessoesElegiveisParaRecibo()` e
  `listarRecibosEmitidos()`: embed do `Paciente` passa a incluir
  `dependente` e o nome do responsável (mesmo hint de FK usado em
  `buscarPaciente`). Cada função passa a retornar também
  `paciente_dependente` (boolean) e `responsavel_nome` (string ou null).
- `app/(app)/recibos/page.js`: as duas listas (elegíveis e emitidos)
  aplicam a regra visual acima ao renderizar o nome.
- `lib/data/financeiro.js` → `listarInadimplentes()`: mesma extensão do
  embed; retorno ganha `paciente_dependente` e `responsavel_nome`.
- `app/(app)/financeiro/page.js`: a linha de cada inadimplente aplica a
  mesma regra visual.

## Fora de escopo

- Geração de PDF/documento de recibo ou nota fiscal usando CPF/RG — hoje
  o sistema só registra que um recibo foi emitido (linha na tabela
  `Recibo`), sem gerar documento. Os campos de documento ficam
  disponíveis no cadastro para uso futuro nessa geração, mas nenhuma
  tela de impressão/PDF é criada nesta rodada.
- Validação de dígito verificador de CPF.
- Impedir cadeias de dependência (A→B→C) — explicitamente permitido por
  decisão do usuário.
