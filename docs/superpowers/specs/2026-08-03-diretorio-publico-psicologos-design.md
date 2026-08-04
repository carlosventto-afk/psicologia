# Diretório público de psicólogos — design

Status: aprovado em conversa, aguardando revisão do arquivo escrito.
Item 2 do backlog (`docs/backlog-novas-funcionalidades.md`).

## Contexto

O PsiFácil hoje é 100% uma ferramenta privada de gestão de consultório — cada
psicólogo só vê os próprios dados. Este item introduz a segunda superfície
pública "de verdade" do produto (depois do blog e da landing): um diretório
onde pacientes em potencial encontram e contatam psicólogos cadastrados —
o pedaço "marketplace" do produto, inspirado em referências como
nossospsicologos.com.br (diretório simples, contato direto) e
doctoralia.com.br (mais robusto, com agendamento online, pagamento e
avaliações — cuja complexidade foi explicitamente descartada nesta entrega).

Pré-requisito já satisfeito: item 3 (convite/autocadastro de profissionais,
com `Usuarios.role`/`aprovado`/`crp` e `public.is_admin()`) já está
implementado e em produção.

## Decisões de escopo (da conversa de brainstorming)

1. **Catálogo + contato direto, não agendamento online.** Paciente encontra
   o perfil e fala direto no WhatsApp do psicólogo — sem conta de paciente,
   sem reserva de horário pela plataforma, sem pagamento online. Agendamento
   online é intenção explícita de **entrega futura**, não desta.
2. **Todo contato precisa ser registrado como evento**, para virar indicador
   pro psicólogo (e, no futuro, base pra evoluir pra agendamento de verdade).
3. **Visibilidade é opt-in do próprio profissional** — não existe uma
   segunda aprovação do admin sobre o conteúdo do perfil. Depois de já
   `aprovado` pra usar a ferramenta (item 3), o psicólogo preenche o perfil
   público quando quiser e liga um interruptor "Aparecer no diretório".
4. **Especialidades são uma lista fixa, multi-seleção** (não texto livre) —
   necessário pra busca/filtro funcionar de verdade.
5. **Localização é um campo próprio do perfil público** (cidade/estado),
   independente do endereço do Consultório (que é texto livre e não serve
   pra filtro; além disso, quem atende só online não tem consultório físico
   necessariamente ligado a uma cidade).
6. **Contato é um link direto pro WhatsApp** (`wa.me/...` com mensagem
   pronta) — não um formulário na página, e sem notificação automática pro
   psicólogo. Motivo: o "agente de WhatsApp" do produto (que poderia
   notificar automaticamente) **ainda não tem o envio de mensagens
   implementado de verdade** — só o banco de dados/RPCs existem, o workflow
   n8n que dispararia mensagens nunca foi construído (confirmado em
   `docs/status-implementacao.md`, seção "Agente de WhatsApp — Fase A"). Não
   faz sentido essa feature depender de uma integração que ainda não existe;
   o link direto resolve o "contato" sem essa dependência, e o clique ainda
   assim é registrado no banco antes do redirect — o indicador pedido no
   item 2 é satisfeito mesmo sem notificação ativa.
7. **Subdomínio dedicado**: `busca.psifacil.com.br`, mesmo padrão já
   validado em produção para `blog.` e `comece.` (rewrite em `web/proxy.js`,
   nunca passa por `updateSession`).

## Arquitetura de dados

**Tabela nova `PerfilPublico`** (1:1 com `Usuarios`), em vez de estender
`Usuarios` diretamente. Razão: `Usuarios` não tem hoje nenhuma policy de
leitura pública (só `id_user = auth.uid() or is_admin()`) — abrir leitura
pública ali arrisca vazar campo sensível (e-mail, telefone de contato
interno, `role`) por engano. Uma tabela separada, com policy própria e
estreita, contém o blast radius — mesmo raciocínio já usado para separar
`artigos` do resto do schema.

```sql
create table public."PerfilPublico" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null unique references "Usuarios"(id) on delete cascade,
  slug text not null unique,
  bio text,
  foto_url text,
  cidade text,
  estado text,
  valor_sessao numeric,           -- null = "a combinar"
  modalidade text not null default 'ambos'
    check (modalidade in ('presencial', 'online', 'ambos')),
  visivel_diretorio boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public."Especialidade" (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table public."PerfilEspecialidade" (
  perfil_id uuid not null references "PerfilPublico"(id) on delete cascade,
  especialidade_id uuid not null references "Especialidade"(id) on delete cascade,
  primary key (perfil_id, especialidade_id)
);

create table public."ContatoDiretorio" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references "Usuarios"(id) on delete cascade,
  criado_em timestamptz not null default now(),
  origem text not null default 'perfil'
);
```

**RLS:**
- `PerfilPublico`: `select` liberado quando `visivel_diretorio = true`, ou
  para o próprio dono (`usuario_id`'s `id_user = auth.uid()`), ou admin.
  `insert`/`update`/`delete` só dono ou admin.
- `Especialidade`: `select` público (anon + authenticated) — é só lista de
  referência, mesmo espírito de `TipoAtendimento`/`TipoCobranca`, mas com
  leitura liberada pra `anon` também (a busca pública precisa disso).
- `PerfilEspecialidade`: `select` acompanha a visibilidade do
  `PerfilPublico` relacionado (via subquery); escrita só dono/admin.
- `ContatoDiretorio`: `insert` liberado pra **qualquer um, inclusive anon**
  (é o clique do visitante) — `select` só pro dono (`usuario_id`) ou admin.
  Visitante nunca lê essa tabela, só grava.

**Especialidades — seed inicial** (lista fixa, sem UI de admin pra
gerenciar nesta entrega — mesmo padrão de `TipoAtendimento`/`TipoCobranca`,
que também são só seed de migration, sem CRUD): Terapia
Cognitivo-Comportamental (TCC), Psicanálise, Terapia Humanista,
Gestalt-terapia, Terapia Sistêmica/Familiar, Terapia de Casal, Ansiedade,
Depressão, Luto, Transtornos Alimentares, TDAH, Autismo/Neurodivergência,
Dependência Química, Psicologia Infantil, Psicologia do Adolescente,
Psicologia Organizacional/Carreira, Sexualidade, Gênero e LGBTQIA+,
Trauma/TEPT.

**Storage**: bucket novo no Supabase Storage pra foto de perfil — primeira
vez que o projeto usa Storage. Bucket público de leitura (as fotos são
públicas por definição), upload restrito ao dono autenticado.

## Roteamento e SEO

`web/proxy.js` ganha um bloco para `busca.` idêntico em espírito ao de
`blog.`/`comece.`: rewrite pra `/busca/...`, nunca passa por
`updateSession`.

`web/app/sitemap.js` (hoje dedicado só ao blog, usa `NEXT_PUBLIC_BLOG_URL`)
passa a incluir também os perfis com `visivel_diretorio = true`, com suas
URLs absolutas em `busca.psifacil.com.br` (nova env var
`NEXT_PUBLIC_BUSCA_URL`) — o mesmo arquivo raiz serve os dois conjuntos de
URL, cada um com o host correto. Isso é uma simplificação pragmática (o
Next.js não tem convenção de `sitemap.js` por subdomínio/segmento,
confirmado ao construir o blog) — suficiente pro lançamento, refinável
depois se necessário.

## Páginas e fluxos

**Público:**
- `busca.psifacil.com.br` (`/busca`) — listagem com filtros (especialidade,
  cidade, modalidade, faixa de valor). Cards: foto, nome, especialidades,
  cidade, modalidade, valor (ou "a combinar").
- `/busca/[slug]` — perfil individual: foto, bio, especialidades, cidade,
  modalidade, valor, CRP, botão "Falar no WhatsApp".
- `/busca/ir/[perfilId]` (Route Handler `GET`) — insere uma linha em
  `ContatoDiretorio` (`usuario_id`, `origem: 'perfil'`) e redireciona (307)
  pra `https://wa.me/<contato do psicólogo>?text=<mensagem pronta>`. Usa o
  campo `Usuarios.contato` (telefone já obrigatório no cadastro) como
  número público — não o `whatsapp_number` do agente de lembretes, que é
  uma conexão separada (nem todo profissional necessariamente já
  configurou).

**App (logado, psicólogo):**
- Página nova `/diretorio` — formulário pra editar bio, foto (upload),
  cidade/estado, valor, modalidade, especialidades (multi-seleção), e o
  interruptor "Aparecer no diretório público". Mesmo padrão de
  `useActionState`/Server Action já usado em todo o app. `slug` é gerado
  automaticamente a partir do nome na primeira vez que o perfil é salvo
  (mesma normalização já usada em `web/lib/actions/artigos.js` —
  minúsculo, sem acento, espaços viram hífen), não é um campo editável no
  formulário; colisão de slug (dois "João Silva") resolve com sufixo
  numérico incremental.
- Mesma página mostra um indicador simples: contagem de `ContatoDiretorio`
  do próprio profissional (ex: total e/ou últimos 30 dias).
- Link novo "Diretório" no nav principal (`web/app/(app)/layout.js`),
  visível pra qualquer profissional (não só admin — diferente do link
  "Administração" que já existe ali).

## Fora de escopo nesta entrega

- Agendamento online e pagamento pela plataforma (intenção futura confirmada
  pelo usuário, mas não construída agora).
- Avaliações/reviews de pacientes.
- Segunda aprovação do admin sobre conteúdo do perfil (fica só o opt-in do
  profissional).
- Verificação de CRP (continua só um campo informado, sem checagem).
- Notificação ativa (WhatsApp/e-mail) de lead pro psicólogo — depende do
  agente de WhatsApp ainda não construído; fica só o clique registrado.
- UI de admin pra gerenciar a lista de `Especialidade` (fica só seed via
  migration, mesmo padrão de `TipoAtendimento`/`TipoCobranca`).

## Verificação (pra quando for implementado)

- Perfil só aparece em `/busca` e no sitemap depois de `visivel_diretorio =
  true`.
- RLS: visitante anônimo consegue ler perfis visíveis e inserir em
  `ContatoDiretorio`, mas não consegue ler `ContatoDiretorio` de ninguém.
- Clique em "Falar no WhatsApp" grava a linha antes de redirecionar (testar
  que o registro acontece mesmo se o usuário fechar a aba rápido depois do
  clique — o insert precisa ser síncrono antes do redirect, não
  fire-and-forget do lado do cliente).
- Upload de foto funciona e o bucket não permite escrita de quem não é o
  dono do perfil.
- `busca.psifacil.com.br`, `blog.psifacil.com.br`, `comece.psifacil.com.br`
  e `psifacil.com.br` continuam todos respondendo depois da mudança no
  `proxy.js`.
