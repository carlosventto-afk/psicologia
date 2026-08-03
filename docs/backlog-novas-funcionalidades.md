# Backlog de novas funcionalidades (pós-MVP)

Criado em 2026-08-03, a pedido do usuário. Estes 4 itens não têm implementação
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

---

## 2. Diretório público de psicólogos (busca por paciente)

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
