# Papel "criador de conteúdo" no blog — design

Status: aprovado em conversa.
Evolução pedida do item 1 do backlog
(`docs/backlog-novas-funcionalidades.md`), já documentada numa sessão
anterior — este design só fecha os detalhes de implementação.

## Contexto

`/admin/artigos` hoje usa o mesmo gate de admin de `/admin/profissionais`
(`web/app/(app)/admin/layout.js`, checa só `role === "admin"`), então só
quem administra a plataforma inteira pode publicar artigo no blog. O
pedido: o admin poder marcar profissionais específicos como aptos a
publicar, sem dar acesso administrativo completo a eles.

Confirmado no código: nenhuma das três páginas de artigos
(`admin/artigos/page.js`, `admin/artigos/novo/page.js`,
`admin/artigos/[id]/editar/page.js`) tem checagem de role própria — todas
dependem só do gate do layout compartilhado.

## Decisão

1. **Coluna nova** `Usuarios.criador_conteudo boolean not null default
   false`.
2. **RLS**: a policy de escrita em `public.artigos` (`artigos_admin_write`,
   hoje `using (public.is_admin())`) passa a aceitar também quem tem
   `criador_conteudo = true`.
3. **Gate do layout** (`admin/layout.js`) relaxa de "só admin" pra "admin
   OU criador_conteudo". O link "Profissionais" no nav do admin só
   aparece pra admin de verdade — criador de conteúdo não deve nem saber
   que essa tela existe.
4. **Novo gate explícito** em `admin/profissionais/page.js` e
   `admin/profissionais/novo/page.js` (hoje sem checagem própria, só
   escondidas do nav): redirecionam pra `/admin/artigos` se
   `usuario.role !== "admin"` — sem isso, um criador de conteúdo
   acessaria `/admin/profissionais` digitando a URL direto, já que o
   layout deixou de bloquear.
5. **UI**: um botão a mais por linha em `/admin/profissionais` (que já
   lista todo profissional) — "Tornar criador de conteúdo" /
   "Remover criador de conteúdo", mesmo padrão visual do botão "Aprovar"
   já existente ali.
6. **Ação** `alternarCriadorConteudo(id, valorAtual)` em
   `web/lib/actions/profissionais.js`, mesmo padrão de
   `aprovarProfissional` — segurança via RLS (só admin passa no update de
   `Usuarios` de outra pessoa), sem checagem de role duplicada na Server
   Action, consistente com o resto do arquivo.

## Fora de escopo

Autoria visível no artigo publicado (byline "por Fulano") — o backlog já
deixava essa decisão em aberto ("se cada artigo tem autor atribuído...ou é
só editorial da marca"); este design só resolve quem PODE publicar, não
atribuição de autoria.

## Verificação

- Usuário sem `criador_conteudo` e sem `role=admin`: `/admin/artigos`
  redireciona; RLS bloqueia insert/update direto em `artigos`.
- Usuário com `criador_conteudo=true`, `role != admin`: acessa e publica
  em `/admin/artigos`; `/admin/profissionais` redireciona; link
  "Profissionais" não aparece no nav.
- Admin: continua acessando as duas áreas normalmente, e vê/alterna o
  botão de criador de conteúdo por profissional.
