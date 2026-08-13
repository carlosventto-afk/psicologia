# Planos do produto (Psi Gestão / Psi Gestão + Marketing / Psi Marketing)

## Contexto

O produto terá 3 planos: **Psi Gestão** (acesso ao sistema de gestão —
Painel, Agenda, Financeiro, Pacientes, Recibos, Recorrências,
Consultórios, Pacotes, Configurações), **Psi Gestão + Marketing** (os
dois) e **Psi Marketing** (só divulgação no diretório público,
`busca.psiagente.com.br`).

Esta é a primeira metade do item 11 do backlog
(`docs/backlog-novas-funcionalidades.md`): o modelo de plano e o
controle de acesso. **Cobrança recorrente/gateway de pagamento fica de
fora** — o plano de cada usuário é atribuído manualmente por um
administrador em `/admin/profissionais`, sem nenhum fluxo de pagamento
nesta entrega.

Hoje nenhuma tela de gestão tem controle de acesso próprio (só
`/admin/*`, gated por `role`). Qualquer usuário logado (independente de
`role`/`aprovado`) acessa qualquer tela do grupo `app/(app)`. Este spec
introduz a primeira trava de acesso baseada em plano.

Verificado em produção: **nenhum perfil está com `visivel_diretorio =
true` hoje** — atribuir Plano A (Gestão) a todos os usuários existentes
não tira visibilidade real de ninguém.

## Modelo de dados

Migration em `Usuarios`:

```sql
alter table public."Usuarios"
  add column plano text not null default 'gestao'
    check (plano in ('gestao', 'gestao_marketing', 'marketing'));
```

- Todo usuário (existente e novo cadastro) nasce `plano = 'gestao'` —
  decisão explícita do usuário, dado que ninguém está visível no
  diretório hoje.
- Sem FK/tabela de planos separada — só os 3 valores fixos, via `check`.
  Não há necessidade de uma tabela `Plano` própria nesta entrega (não há
  preço, período ou metadado por plano ainda — é fora de escopo, ver
  spec original do item 11).

## Controle de acesso

**Reestruturação de rotas**: as telas de gestão (`page.js` raiz/Painel,
`agenda/`, `financeiro/`, `pacientes/`, `recibos/`, `recorrencias/`,
`consultorios/`, `pacotes/`, `sessoes/`, `configuracoes/`) migram para
dentro de um novo route group `app/(app)/(gestao)/` — um agrupamento de
pastas do Next.js App Router que **não aparece na URL** (ex.:
`app/(app)/(gestao)/agenda/page.js` continua servindo `/agenda`
normalmente). O group ganha um `layout.js` próprio com a única trava:

```js
// app/(app)/(gestao)/layout.js
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutGestao({ children }) {
  const usuario = await buscarUsuarioAtual();
  if (usuario.plano === "marketing") {
    redirect("/diretorio");
  }
  return children;
}
```

Ficam **fora** do group, direto em `app/(app)/`: `diretorio/` (trava
própria, ver abaixo) e `admin/` (trava por `role`, já existente,
inalterada — plano não afeta acesso admin).

**`/diretorio`** ganha a trava simétrica, direto em
`app/(app)/diretorio/page.js` (mesmo padrão de checagem explícita já
usado em `admin/profissionais/page.js`):

```js
if (usuario.plano === "gestao") {
  redirect("/");
}
```

**Por que route group para gestão, mas checagem inline para
diretório**: gestão tem ~9 áreas a proteger com a mesma regra — um gate
centralizado evita duplicar a checagem em cada página (e protege
automaticamente qualquer tela de gestão futura). Diretório é uma página
só, então uma checagem inline é mais direta e seguem o padrão que já
existe no projeto (`admin/profissionais/page.js`).

## `lib/data/usuario.js`

`buscarUsuarioAtual()` já existe e centraliza a leitura do usuário
logado — só precisa incluir `plano` no `.select(...)` pra ficar
disponível nos dois gates acima e na sidebar.

## Sidebar (`SidebarNav.js`)

Recebe um novo prop `plano` (igual já recebe `ehAdmin`). Quando
`plano === 'marketing'`, a lista de itens de navegação vira só
`[Diretório]` (mais o botão Sair, que já é renderizado à parte, fora de
`ITENS_NAV`). Para os outros dois planos, o menu continua como está hoje
(sem mudança visível).

## Admin atribui o plano (`/admin/profissionais`)

Mesmo padrão visual do toggle "Criador de conteúdo" já existente
(`lib/actions/profissionais.js`): um seletor de plano (3 opções) por
linha da listagem, com uma Server Action `alterarPlano(id, novoPlano)`
que faz um `update` simples em `Usuarios.plano`, sem validação de
transição (qualquer admin pode mudar qualquer usuário pra qualquer
plano a qualquer momento, incluindo o próprio — não há regra de negócio
adicional nesta entrega).

## Fora de escopo

- Gateway/cobrança de pagamento (metade 2 do item 11 do backlog, ver
  `docs/backlog-novas-funcionalidades.md`).
- Autoatendimento — usuário escolher/trocar o próprio plano.
- Preço, período de cobrança, inadimplência, downgrade automático.
- Tabela `Plano` separada com metadados (nome de exibição, preço, etc.)
  — os 3 valores ficam fixos no código/constraint por enquanto.
- Qualquer mudança em `visivel_diretorio` — quem tem plano `gestao`
  simplesmente não alcança a tela que expõe esse campo; não é preciso
  validar `visivel_diretorio` por plano em `salvarPerfil`.
