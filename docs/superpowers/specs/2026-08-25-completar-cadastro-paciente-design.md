# Link público pro paciente completar o próprio cadastro

Status: aprovado para plano de implementação
Data: 2026-08-25
Pedido do usuário, item 14 do backlog (`docs/backlog-novas-funcionalidades.md`).

## Objetivo

O profissional, de dentro do app, gera um link pra um paciente específico e
manda por fora (WhatsApp pessoal, SMS — mais adiante dá pra automatizar via
o agente de WhatsApp, item 13). O paciente abre o link **sem precisar logar**
e atualiza os próprios dados de contato/documento. Nada é gravado direto na
ficha do paciente — vira uma proposta pendente que o profissional revisa e
aceita (no todo ou campo a campo) ou rejeita.

**Campos editáveis pelo paciente** (decidido em 2026-08-17): `telefone`,
`email`, `endereco`, `cpf`, `rg_numero`, `rg_data_expedicao`,
`rg_orgao_emissor`. Anamnese (item 12) fica de fora — é registro clínico do
profissional, não autodeclarado pelo paciente.

## Modelo de dados

### `TokenCompletarCadastro`

- `id uuid` PK, default `gen_random_uuid()`
- `paciente_id bigint not null references "Paciente"(id) on delete cascade`
- `token text not null unique` — gerado com `encode(gen_random_bytes(24), 'hex')`
  (48 caracteres hex, não é um UUID previsível por padrão de geração)
- `criado_em timestamptz not null default now()`
- `expira_em timestamptz not null` — `criado_em + interval '7 days'`
- `usado_em timestamptz` — nullable, setado quando o paciente envia o
  formulário

**Invalidação de link anterior:** ao gerar um link novo pro mesmo paciente,
a RPC de geração faz `update ... set expira_em = now() where paciente_id =
p_paciente_id and usado_em is null and expira_em > now()` antes de inserir o
token novo — não precisa de coluna extra, só reaproveita a mesma checagem
`expira_em > now()` que a validação já usa. Efeito: só o link mais recente
funciona.

RLS: habilitada, **sem nenhuma policy** — nem `anon` nem `authenticated`
leem/escrevem a tabela direto. Todo acesso passa pelas RPCs (mesmo padrão de
`whatsapp_verificacao_codigos`).

### `PropostaCompletarCadastro`

- `id uuid` PK, default `gen_random_uuid()`
- `paciente_id bigint not null references "Paciente"(id) on delete cascade`
- `token_id uuid not null references "TokenCompletarCadastro"(id)`
- `status text not null default 'pendente'` — `'pendente' | 'aceita' |
  'rejeitada'`, `check (status in (...))`
- `telefone_pendente text`, `email_pendente text`, `endereco_pendente text`,
  `cpf_pendente text`, `rg_numero_pendente text`, `rg_data_expedicao_pendente
  date`, `rg_orgao_emissor_pendente text` — os 7 campos que o paciente
  enviou, sempre os valores enviados no formulário (não só os que mudaram —
  o formulário já vem pré-preenchido com o valor atual, então "não mudou" e
  "reenviou o mesmo valor" são indistinguíveis e não precisam ser)
- `criado_em timestamptz not null default now()`
- `decidido_em timestamptz` — nullable, setado ao aceitar ou rejeitar

**Janela de ação (duas regras diferentes, confirmadas em conversa):**
- `pendente`: sem prazo — fica esperando o profissional agir indefinidamente.
- `rejeitada`: pode ser aceita "mesmo assim" só até `criado_em + interval '60
  days'`. Depois disso, a proposta continua existindo (nunca é apagada, serve
  de histórico), só perde a ação de aceitar.

RLS: habilitada, **sem policy pra escrita** (só as RPCs escrevem). Uma
policy de leitura pro profissional dono:
```sql
create policy "propostacompletarcadastro_select_dono" on "PropostaCompletarCadastro"
  for select using (
    exists (
      select 1 from "Paciente" p
      where p.id = paciente_id and (p.owner = auth.uid() or public.is_admin())
    )
  );
```

## RPCs (`security definer`, mesmo padrão de `validar_codigo_whatsapp`)

| RPC | Executor | Grant | Faz |
|---|---|---|---|
| `gerar_link_completar_cadastro(p_paciente_id bigint)` | `authenticated` | `authenticated` | Confere `Paciente.owner = auth.uid()`; invalida token anterior ativo; insere token novo; retorna `text` (o token) |
| `buscar_dados_completar_cadastro(p_token text)` | `anon` | `anon` | Valida token (existe, `usado_em is null`, `expira_em > now()`); retorna `jsonb` com `nome` do paciente + valores atuais dos 7 campos. Erro `TOKEN_INVALIDO` se falhar qualquer checagem |
| `enviar_proposta_completar_cadastro(p_token text, p_telefone text, p_email text, p_endereco text, p_cpf text, p_rg_numero text, p_rg_data_expedicao date, p_rg_orgao_emissor text)` | `anon` | `anon` | Revalida token (mesmas checagens); marca `usado_em = now()`; insere `PropostaCompletarCadastro` (`status = 'pendente'`) |
| `aceitar_proposta_completar_cadastro(p_proposta_id uuid, p_campos_aceitos text[])` | `authenticated` | `authenticated` | Confere dono via `Paciente.owner`; se `status = 'rejeitada'` exige `now() <= criado_em + interval '60 days'` (senão erro `PRAZO_EXPIRADO`); se `status = 'aceita'` erro `JA_DECIDIDA`; aplica em `Paciente` só os campos cujo nome está em `p_campos_aceitos`; marca `status = 'aceita'`, `decidido_em = now()` |
| `rejeitar_proposta_completar_cadastro(p_proposta_id uuid)` | `authenticated` | `authenticated` | Confere dono; erro `JA_DECIDIDA` se `status != 'pendente'`; marca `status = 'rejeitada'`, `decidido_em = now()` |

Todas revogadas de `public`/`anon`/`authenticated` por padrão e regrantadas
seletivamente (mesmo padrão de `revoke all ... ; grant execute ... to X` já
usado nas migrations do agente de WhatsApp).

## Fluxo ponta a ponta

1. Profissional abre `/pacientes/[id]`, clica "Gerar link de atualização" →
   server action chama `gerar_link_completar_cadastro` → mostra
   `https://psiagente.com.br/completar-cadastro/{token}` com botão de copiar.
2. Profissional manda o link pro paciente por fora do app.
3. Paciente abre o link (rota pública, sem login). A página chama
   `buscar_dados_completar_cadastro`; se erro, mostra "Este link não é mais
   válido, peça um novo ao seu profissional"; se ok, mostra formulário
   pré-preenchido com nome do paciente pra contexto.
4. Paciente edita e envia → chama `enviar_proposta_completar_cadastro` →
   tela de confirmação ("Recebemos suas informações, o profissional vai
   revisar").
5. Profissional, ao abrir `/pacientes/[id]`, vê aviso se existe proposta
   `pendente` OU `rejeitada` dentro dos 60 dias. Abre
   `/pacientes/[id]/proposta-cadastro`: lista os 7 campos (valor atual ao
   lado do proposto), cada linha com checkbox marcado por padrão.
6. "Aceitar selecionados" → `aceitar_proposta_completar_cadastro` com os
   campos marcados → aplica em `Paciente`, revalida a página.
7. "Rejeitar" → `rejeitar_proposta_completar_cadastro`. Proposta rejeitada
   dentro dos 60 dias continua aparecendo na mesma tela com aviso "Rejeitada
   em [data], ainda pode aceitar até [data+60]" e o botão vira "Aceitar
   mesmo assim" (mesma RPC de aceitar).

## UI — arquivos novos

- `web/app/completar-cadastro/[token]/page.js` — página pública. Fora do
  grupo `(app)`, mesmo padrão de `/cadastro`.
- `web/lib/data/completar-cadastro.js` — `buscarDadosCompletarCadastro(token)`
  (chama a RPC via client `anon`, sem sessão).
- `web/lib/actions/completar-cadastro.js` — `enviarPropostaCompletarCadastro`,
  `gerarLinkCompletarCadastro`, `aceitarPropostaCompletarCadastro`,
  `rejeitarPropostaCompletarCadastro`.
- `web/app/(app)/(gestao)/pacientes/[id]/proposta-cadastro/page.js` — tela
  de revisão do profissional.
- Migration nova em `supabase/migrations/` criando as duas tabelas + RPCs +
  RLS.

## UI — arquivos alterados

- `web/app/(app)/(gestao)/pacientes/[id]/page.js` — botão "Gerar link de
  atualização" + aviso condicional de proposta pendente/rejeitada-no-prazo.
- `web/lib/supabase/proxy.js` — adicionar `/completar-cadastro` a
  `PUBLIC_PATHS`.

## Erros

Mesmo padrão do resto do app: mensagens genéricas pro usuário
("Não foi possível gerar o link.", "Este link não é mais válido."), sem
vazar detalhe de banco. As RPCs sinalizam com `errcode = 'P0001'` e uma
mensagem curta (`TOKEN_INVALIDO`, `PRAZO_EXPIRADO`, `JA_DECIDIDA`), que a
Server Action traduz pra texto amigável — mesmo padrão de tratamento de erro
já usado em `web/lib/actions/whatsapp.js` (`USUARIO_NAO_ENCONTRADO`,
`CODIGO_INVALIDO`).

**Concorrência (dois links gerados quase ao mesmo tempo, ou paciente enviando
o formulário duas vezes com abas abertas):** não é um risco relevante aqui —
pior caso é um token ficando invalidado por engano ou uma proposta duplicada
inofensiva (`enviar_proposta_completar_cadastro` sempre cria uma linha nova;
se enviar duas vezes seguidas com o mesmo token, a segunda falha porque o
token já foi marcado `usado_em`). Sem tratamento especial.

## Testes

Sem suíte automatizada (mesmo padrão dos itens 12/13). Roteiro de verificação
end-to-end via build + preview local (Playwright CLI), dados descartáveis:

1. Gerar link, abrir sem estar logado (sessão anônima/nova aba anônima),
   confirmar que carrega os dados atuais do paciente.
2. Enviar o formulário com um campo alterado, confirmar aviso de proposta
   pendente na ficha do paciente.
3. Aceitar desmarcando um dos campos propostos — confirmar que só os campos
   marcados mudam em `Paciente`.
4. Rejeitar uma proposta, depois usar "Aceitar mesmo assim" — confirmar que
   aplica corretamente.
5. Tentar reusar um token já usado, e um token expirado (forjar
   `expira_em` no passado via SQL) — confirmar mensagem de erro sem detalhe
   técnico.
6. Gerar um segundo link pro mesmo paciente sem usar o primeiro — confirmar
   que o primeiro link para de funcionar.
7. RLS: paciente de outro profissional não deve aparecer na leitura de
   `PropostaCompletarCadastro` (revisão da policy por inspeção de SQL, ou
   teste com dois usuários).
