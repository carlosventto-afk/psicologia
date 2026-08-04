# Backlog de novas funcionalidades (pós-MVP)

Criado em 2026-08-03, a pedido do usuário. Estes itens não têm implementação
iniciada — é um backlog para priorizar depois, não uma especificação fechada.
Cada um vira um plano próprio quando for destravado.

## Contexto: o que muda de natureza aqui

O PsiFácil hoje é uma ferramenta **privada** de gestão de consultório: cada
psicólogo só vê seus próprios dados (RLS por `owner = auth.uid()`), não existe
nenhuma página pública, e `web/` inteiro fica atrás de login (`proxy.js` +
grupo de rotas `app/(app)`, exceto `app/(auth)` de login/recuperação). Os 4
itens abaixo introduzem uma superfície **pública** (conteúdo, diretório de
profissionais, landing page) que hoje não existe. Vale decidir cedo se isso
entra como novos grupos de rota no mesmo app Next.js (reaproveita design
system, deploy no EasyPanel e o mesmo Supabase) ou como site(s) separado(s).
Recomendo manter no mesmo app/repo por padrão — evita duplicar
pipeline/infra — mas é uma decisão a confirmar quando o item for iniciado.

Já existe uma base pequena que ajuda o item 3: `Usuarios.role` e a função
`public.is_admin()` (`supabase/migrations/20260727000003_enable_rls_policies.sql`)
já implementam bypass de admin nas policies de RLS — hoje sem nenhuma tela que
use isso, mas o "quem é admin" já está modelado no banco.

## Ordem sugerida e dependências

- **Itens 1 (blog) e 4 (landing page)** são independentes entre si e do resto
  — conteúdo/marketing, não mexem no modelo de dados nem em autenticação.
  Podem ser feitos a qualquer momento, inclusive em paralelo, e servem como
  "quick wins" enquanto os itens 2/3 são desenhados com calma.
- **Item 3 (painel admin + cadastro de profissionais) é pré-requisito do
  item 2 (diretório público)** — o diretório só faz sentido depois de existir
  um jeito de um profissional entrar no sistema (convite ou autocadastro) e de
  alguém aprovar/moderar antes de ficar visível publicamente. Sugestão:
  3 antes de 2.

---

## 1. Blog de psicologia e saúde mental

**Status: implementado** (2026-08-03) — `/blog` + `/blog/[slug]` em
`blog.psifacil.com.br`, tabela `public.artigos` no Supabase, painel
`/admin/artigos` pro CRUD, Markdown via `marked`, sitemap.xml/robots.js.
Hoje quem escreve/publica é só quem tem `role = 'admin'` (mesmo gate do
item 3, `web/app/(app)/admin/layout.js`) — ver evolução pedida abaixo.

**Objetivo:** conteúdo educativo/SEO para atrair tráfego orgânico (pacientes
e, indiretamente, psicólogos interessados na ferramenta).

**Escopo provável:**
- Listagem + página de artigo (`/blog`, `/blog/[slug]`), fora da área logada.
- Editor de conteúdo: decidir entre (a) tabela própria no Supabase com um CRUD
  simples só para admins, ou (b) CMS headless externo (ex: um Markdown em
  repo, ou Sanity/Strapi) buscando por API. Para o volume inicial (poucos
  posts, 1-2 pessoas escrevendo), (a) é mais simples e não introduz outro
  serviço pra manter.
- SEO básico: metadata por página, sitemap.xml, OpenGraph pra compartilhamento.

**Decisões em aberto:** quem escreve o conteúdo (o próprio usuário? terceiro?
IA com revisão humana?); se cada artigo tem autor atribuído a um psicólogo
cadastrado (linkaria com o item 2 futuramente) ou é só editorial da marca.

**Tamanho estimado:** P/M — não depende de mudança de arquitetura, é a peça
mais isolada do backlog.

### Evolução pedida: papel de "criador de conteúdo" separado de admin

Hoje `/admin/artigos` usa o mesmo gate de `role = 'admin'` de
`/admin/profissionais` — ou seja, só quem administra a plataforma inteira
pode publicar artigo. O pedido é desacoplar isso: criar uma marcação nova em
`Usuarios` (ex: `criador_conteudo boolean`) que **só um admin pode atribuir**
a outros usuários, e liberar o acesso à página de publicação de artigos pra
quem tiver essa marcação — sem precisar ser admin da plataforma.

**Implica:**
- Coluna nova em `Usuarios` (hoje só tem `role`) + policy de RLS em
  `artigos` que hoje é só `using (public.is_admin())` pra escrita, precisa
  virar algo como `using (public.is_admin() or (select criador_conteudo
  from "Usuarios" where id_user = auth.uid()))`.
- `/admin/artigos` (e só essa rota, não `/admin/profissionais`) passa a
  aceitar admin OU criador de conteúdo — hoje o gate é compartilhado no
  `web/app/(app)/admin/layout.js` pra toda a área `/admin`, então essa rota
  provavelmente precisa de um gate próprio em vez de herdar o da área toda.
- UI pra admin marcar/desmarcar "criador de conteúdo" em algum usuário —
  provavelmente uma ação a mais na listagem de `/admin/profissionais`
  (que já existe) em vez de tela nova.

**Tamanho estimado:** P — é uma extensão pontual do que já existe, não uma
feature nova do zero.

---

## 2. Diretório público de psicólogos (busca por paciente)

**Status: implementado** (2026-08-03/04) — `busca.psifacil.com.br`
(listagem com filtros, perfil individual, contato via WhatsApp registrado
em `ContatoDiretorio`), painel `/diretorio` pro profissional editar o
próprio perfil e controlar visibilidade. Extensão nesta sessão: CTA de
cadastro em `/busca`, Termos de Uso com aceite obrigatório, barreira
mínima de qualidade (bio/foto/especialidade obrigatórios pra publicar),
botão de compartilhar perfil e Open Graph na página pública.

**Objetivo:** site público onde pacientes em potencial encontram e
contatam psicólogos cadastrados na ferramenta — o pedaço "marketplace" do
produto.

**Escopo provável:**
- Perfil público por psicólogo: foto, bio, abordagem/especialidades, valor
  aproximado da sessão, modalidade (presencial/online), cidade/bairro.
  Precisa de campos novos (hoje `Usuarios` não tem nada disso — é só conta de
  login) e de um **flag explícito de opt-in** ("aparecer no diretório"), já
  que por padrão os dados de um psicólogo cadastrado são só operacionais.
- Busca/filtro público (`/psicologos` ou `/encontrar-psicologo`): por
  especialidade, cidade, modalidade, faixa de preço.
- Contato: como o paciente chega até o psicólogo sem expor WhatsApp/e-mail
  direto de cara — formulário de contato com notificação, ou exibir o
  contato só depois de algum passo (a decidir; tem implicação de LGPD/spam).
- **Moderação:** perfil só fica visível depois de aprovado por um admin (via
  item 3) — evita perfil incompleto/spam indo ao ar sozinho.

**Decisões em aberto:** modelo de moderação (aprovação manual sempre, ou só na
primeira vez?); se há algum critério de verificação profissional (CRP) antes
de aparecer publicamente — plausivelmente sim, dado que é uma indicação a
pacientes reais; monetização (é gratuito pro psicólogo aparecer, ou é
diferencial pago?) — não precisa decidir agora, mas influencia o desenho do
cadastro.

**Tamanho estimado:** G — novo modelo de dados, nova área pública, busca,
moderação. É o item mais substancial do backlog.

---

## 3. Painel administrativo + cadastro de profissionais

**Status: implementado** (2026-08-03/04) — convite pelo admin (primeira
entrega) e autocadastro público (`/cadastro`) com estado `aprovado` em
`Usuarios` (default `true` pra convite, `false` pra autocadastro) e botão de
aprovar em `/admin/profissionais`. Sem gate funcional por `aprovado` — é só
status visível pro admin, não bloqueia uso da ferramenta (não existe item 2
ainda pra esconder o profissional pendente).

**Objetivo:** dar aos administradores do PsiFácil um jeito de gerenciar quais
profissionais existem na plataforma, sem abrir mão de o profissional poder se
cadastrar sozinho.

**Solução recomendada (modelo híbrido):**
- **Autocadastro como fluxo principal:** tela pública de "Cadastre-se como
  psicólogo" (nome, e-mail, CRP, etc.) cria a conta em estado **pendente de
  aprovação** — consegue logar e configurar o consultório, mas não aparece no
  diretório (item 2) nem, se fizer sentido, algumas ações ficam bloqueadas até
  aprovação.
- **Convite como fluxo secundário:** admin cadastra/convida diretamente pela
  Management API do Supabase Auth (convite por e-mail) para profissionais que
  o próprio usuário já conhece/negociou fora da plataforma — pula a etapa de
  aprovação, já que veio por indicação direta do admin.
- Painel admin (`/admin/profissionais` ou similar, protegido por
  `public.is_admin()` já existente): lista de profissionais com status
  (pendente/aprovado/suspenso), ação de aprovar/rejeitar/suspender, e o
  convite manual do fluxo secundário.

**O que já existe e ajuda:** `Usuarios.role` + `is_admin()` já modelam "quem é
admin" nas policies de RLS (migration `20260727000003`). Falta: estado de
aprovação (`status_cadastro` ou similar, hoje inexistente), a tela pública de
autocadastro, e o painel em si — hoje não há nenhuma UI de admin.

**Decisões em aberto:** critério de aprovação (documento/CRP verificado
manualmente pelo admin?); se profissional pendente já pode usar a ferramenta
de gestão normalmente (provavelmente sim — só fica de fora do diretório até
aprovar) ou fica bloqueado até aprovação.

**Tamanho estimado:** M — a maior parte é UI + um campo de status novo; a
infraestrutura de "quem é admin" já existe.

---

## 4. Landing page para tráfego pago (Google Ads)

**Status: implementado** (2026-08-04) — `comece.psifacil.com.br` (mesmo
padrão de subdomínio do blog), CTA "Criar conta grátis" → `/cadastro`,
sem prova social inventada. Tracking de GA4/Google Ads com variável de
ambiente opcional (`NEXT_PUBLIC_GA_MEASUREMENT_ID`/`NEXT_PUBLIC_GOOGLE_ADS_ID`)
— banner de consentimento de cookies só aparece quando algum ID estiver
configurado. Sem sitemap/robots dedicado (página paga, não orgânica).

**Objetivo:** página de conversão simples e rápida para linkar em campanhas
de Google Ads — não é o app, é a porta de entrada de quem ainda não conhece
o PsiFácil.

**Escopo provável:**
- Página única (`/` público, ou `/landing`), foco em proposta de valor +
  CTA (provavelmente "Criar conta grátis" → leva ao cadastro/autocadastro do
  item 3, ou a uma tela de captura de lead + contato comercial).
- Performance é crítica aqui (Quality Score do Google Ads penaliza página
  lenta) — página estática/leve, sem depender de dados do Supabase no
  carregamento inicial.
- Tracking: tag do Google Ads (conversão) + GA4, e por consequência **banner
  de cookies/consentimento** (LGPD) já que vai rastrear visitante antes de
  qualquer login.

**Decisões em aberto:** a landing e o site institucional/blog (item 1) podem
compartilhar layout/hero, ou são intencionalmente páginas distintas com
mensagens diferentes (uma para SEO orgânico, outra para tráfego pago
comprado)? Normalmente vale ter uma landing dedicada por campanha/público, não
uma só genérica.

**Tamanho estimado:** P — é o item mais rápido de entregar, mas vale alinhar
copy/oferta com o usuário antes de construir (não é só código).

---

## 5. Importar pacientes via planilha Excel

**Objetivo:** deixar o psicólogo trazer sua base de pacientes existente (de
outra ferramenta, planilha própria, etc.) de uma vez, em vez de cadastrar um
por um pela tela de "Novo Paciente". Diferente dos itens 1-4, este fica
inteiramente dentro da área logada (`app/(app)/pacientes`) — não mexe em
autenticação nem cria superfície pública.

**Escopo provável:**
- Upload de arquivo `.xlsx`/`.xls` na tela de Pacientes.
- **Tela de mapeamento de colunas**: depois do upload, mostra as colunas
  encontradas na planilha (usando a primeira linha como cabeçalho) e deixa o
  usuário escolher, pra cada campo da tabela `Paciente` (nome, telefone,
  e-mail, etc.), qual coluna do Excel corresponde — em vez de assumir uma
  ordem/nome fixo de coluna, já que cada psicólogo provavelmente exporta de
  um lugar diferente.
- **Preview antes de confirmar**: mostrar algumas linhas já mapeadas pros
  campos reais antes de gravar de fato, pra pegar erro de mapeamento cedo.
- Validação linha a linha (campo obrigatório faltando, formato de
  telefone/e-mail inválido) — decidir se linha inválida bloqueia a importação
  inteira ou só é pulada com um relatório do que não entrou.
- Importação cria os pacientes já associados ao `owner` (psicólogo logado),
  respeitando o RLS existente — sem código novo de autorização, só reaproveita
  o padrão já usado em `lib/actions/pacientes.js`.

**Decisões em aberto:** critério de duplicado (mesmo nome? mesmo telefone?
importa mesmo assim e deixa o usuário resolver depois?); tamanho/formato de
arquivo aceito; biblioteca de parse de Excel no lado servidor (ex: `xlsx` —
avaliar na hora, dado o histórico de vulnerabilidades já reportadas nesse
pacote especificamente, então checar a versão/alternativas antes de adicionar
a dependência).

**Tamanho estimado:** M — upload + parse + tela de mapeamento com preview é
mais interação de UI do que os CRUDs simples já existentes no app, mas não
mexe em modelo de dados nem em RLS.
