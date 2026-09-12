# Home institucional (psiagente.com.br/) — design

Status: aprovado para plano de implementação
Data: 2026-09-11

Pedido do usuário: criar a home do PsiAgente, voltada para apresentar
comercialmente a ferramenta, com acesso ao blog, contato via WhatsApp e
os elementos que uma home de empresa consolidada costuma ter (nav,
preços, FAQ, footer institucional).

## Correção descoberta durante a implementação (2026-09-11)

A premissa original desta spec — "`/` não existe hoje" — estava
**errada**. `web/app/(app)/(gestao)/page.js` (o painel "Resumo de
Hoje") resolve pra `/`, porque as route groups `(app)`/`(gestao)` não
aparecem na URL. O que mascarava isso: qualquer visita deslogada a
`/` já caía no `/login` antes de a página renderizar, então nunca
tinha ficado óbvio que havia uma página real ali por trás do redirect.

Consultado com o usuário, decisão: **mover o painel logado pra
`/painel`**, liberando `/` pra ser de fato a home institucional. Isso
adiciona uma task nova ao plano (renomear a rota do painel + atualizar
os pontos que hoje redirecionam/linkam pra `/` esperando o painel:
`lib/actions/auth.js`, `SidebarNav.js`, `diretorio/page.js`,
`admin/layout.js`) — ver o plano de implementação pra detalhes
exatos. O resto desta spec (estrutura da home, seções, dados) não
muda.

## O que já existe (não faz parte desta entrega)

- **Não existe home hoje na raiz do domínio principal — mas há uma
  página logada resolvendo pra `/` que precisa ser movida primeiro**
  (ver seção acima). Depois da mudança de rota do painel, uma visita a
  `psiagente.com.br/` cai em `updateSession`
  (`web/lib/supabase/proxy.js`), que redireciona pra `/login` porque
  `/` não está em `PUBLIC_PATHS`. Isso precisa mudar (ver seção
  "Middleware" abaixo) senão a home nova nunca é vista por visitante
  não autenticado.
- `web/app/comece/page.js` — landing paga de conversão, servida em
  `comece.psiagente.com.br` via rewrite (`web/proxy.js`). **Fica
  intocada** — decisão explícita do usuário de manter as duas páginas
  separadas (home institucional ≠ landing de campanha).
- `web/app/blog/` — blog completo, servido em `blog.psiagente.com.br`
  via rewrite. `web/lib/data/artigos.js` já expõe
  `listarArtigosPublicados()`.
- `web/app/busca/` — diretório público de psicólogos, servido em
  `busca.psiagente.com.br`.
- `web/lib/planos.js` — `PLANOS` (`gratis`, `gestao`,
  `gestao_marketing`, `marketing`) com preço e flags de recurso
  (`temGestao`, `temDiretorio`, `temDocumentos`, `temWhatsapp`,
  `temCarneLeao`, `limiteConsultorios`) — fonte de verdade dos preços,
  usada como está, sem duplicar valores no componente da home.
- `web/app/(auth)/cadastro/page.js` e `.../login/page.js` — já
  aceitam `?origem=` (hoje só `"busca"` é tratado; `CadastroForm`
  ignora valores desconhecidos, então `origem=home` passa sem quebrar
  nada, só não é usado por enquanto).
- Componentes reaproveitados sem alteração: `LogoPsiAgente`,
  `ConsentimentoCookies`, `IconeWhatsapp`/`IconeMenu`/`IconeFechar`
  (`components/icons/NavIcons.js`).
- `web/app/globals.css` — tokens de marca (petróleo `#17514E`, âmbar
  `#E0913F`, marfim `#F8F6F1`, grafite, cinza-pedra, linha) e classes
  utilitárias (`btn-primary`, `btn-outline`, `card`) já usadas em
  `/comece`.

## Decisão de escopo: home institucional × landing de campanha

Consultado com o usuário: manter as duas separadas (opção B). A home
nova (`/`) é o destino institucional (nav completo, blog, preços,
FAQ); `/comece` continua sendo a página curta de conversão pra tráfego
pago, sem alteração nesta entrega.

## Middleware: liberar `/` sem abrir o resto do app

**Pré-condição:** o painel logado precisa já ter sido movido pra
`/painel` (ver "Correção descoberta durante a implementação" acima) —
sem isso, liberar `/` aqui faz visitante deslogado cair direto no
painel sem sessão (erro 500, reproduzido durante a implementação).

`PUBLIC_PATHS` em `web/lib/supabase/proxy.js` usa
`pathname.startsWith(path)`. Adicionar `"/"` à lista literalmente
tornaria **toda** rota pública (qualquer path começa com `/`) —
quebraria a autenticação inteira. A checagem da raiz precisa ser
exata:

```js
const isPublicPath =
  request.nextUrl.pathname === "/" ||
  PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
```

Comportamento resultante: visitante não logado vê a home normalmente;
usuário logado que abrir `/` também vê a home (sem redirecionamento
forçado pro painel) — o botão "Entrar" no header leva pro login/painel
de quem quiser. Não há necessidade de detectar sessão na home nesta
entrega (YAGNI: nenhum requisito pediu conteúdo diferente para
logado).

## Estrutura da página (`web/app/page.js`)

Página única (server component), mesmo padrão de `/comece` — não
quebrar em vários arquivos de seção, já que é conteúdo estático
montado uma vez. Único componente novo extraído:
`components/HeaderInstitucional.js` (client, por causa do menu
mobile).

**Sem `layout.js` próprio.** `/comece` tem um `layout.js` dedicado só
porque carrega Sora/Inter via `next/font` (otimização específica
daquela página). A home usa o carregamento padrão do app — fontes já
vêm do `@import` do Google Fonts em `globals.css`, herdado do
`app/layout.js` raiz — mesmo esquema que `/blog` e `/termos` já usam.
`export const metadata` fica direto em `page.js` (mesmo padrão de
`app/termos/page.js`), sem criar layout novo.

### 1. Header (`HeaderInstitucional`)

- Fixo no topo, fundo branco, borda inferior (`border-border`).
- Esquerda: `LogoPsiAgente` + "PsiAgente" (mesmo padrão de
  `blog/layout.js`).
- Centro/direita (desktop): links âncora `#recursos`, `#precos`, e
  link absoluto pro blog (`https://blog.psiagente.com.br`, ou
  `NEXT_PUBLIC_BLOG_URL` se definido).
- Direita: botão "Entrar" (`btn-outline`, `href="/login"`) e botão
  "Criar conta grátis" (`btn-primary`, `href="/cadastro?origem=home"`)
  — "Entrar" é um botão real (não link de texto), lado a lado com o
  CTA de cadastro, conforme pedido do usuário.
- Mobile: os links somem, aparece `IconeMenu`/`IconeFechar` que
  abre/fecha um painel com os mesmos links + os dois botões
  empilhados. Estado local (`useState`), sem lib nova.

### 2. Hero

- H1: "Menos trabalho repetitivo. Mais paciente." (reaproveita o texto
  já validado em `/comece`, que já resolve bem o "porquê" do produto).
- Subheadline: mesmo texto de `/comece` ("Agenda, pacientes,
  financeiro e lembrete automático de sessão, com um agente cuidando
  da parte repetitiva — pra sobrar você pra quem senta na sua
  frente.").
- CTA único: "Criar conta grátis" → `/cadastro?origem=home`, com nota
  "Sem cartão de crédito." abaixo (mesmo padrão de `/comece`).
- Fundo com o mesmo efeito de respiração de `/comece`
  (`.respiracao`/`@keyframes respirar` em `comece.css`), mas **em tom
  petróleo, não menta** — `globals.css` documenta que menta
  (`#6FCBB6`) é reservada só pra conteúdo gerado por agente de IA, que
  a home institucional não é. **Não tocar em `comece.css`** (CSS
  escopado a `.comece`, exclusivo daquela página); em vez disso,
  adicionar em `globals.css` uma classe própria (`.glow-suave` + o
  mesmo `@keyframes respirar`, ~15 linhas, sem escopo de ancestral,
  cor via `--color-navy` em baixa opacidade) pra usar só na home.
  Pequena duplicação intencional: mais barato e mais seguro do que
  acoplar as duas páginas públicas ao mesmo seletor CSS.

### 3. Faixa de estatística

Mesmo layout de `/comece` ("1 a 12 horas... documentação manual
consome de você por mês", fundo petróleo) — é a assinatura visual da
marca, repetir reforça reconhecimento entre as duas páginas públicas.
**Número em branco, não menta** (mesma razão do item acima — menta
fica reservada pra conteúdo de IA).

### 4. Recursos (`id="recursos"`)

Título: "Tudo que seu consultório precisa, num só lugar". Grid de 6
cards (ícone + título + descrição curta), todos referentes a recursos
que já existem no produto (nada de feature futura):

1. **Lembrete automático** (`IconeWhatsapp`) — "O sistema confirma e
   avisa cada paciente sozinho, por WhatsApp, no horário certo."
2. **Agenda unificada** (`IconeAgenda`) — "A semana inteira organizada,
   com sessões recorrentes automáticas."
3. **Financeiro em dia** (`IconeFinanceiro`) — "Recibo, pagamento e
   inadimplência reunidos num painel só."
4. **Múltiplos consultórios** (`IconeConsultorio`) — "Cada consultório
   com sua própria agenda e seus próprios pacientes, numa conta só."
5. **Carnê-Leão automático** (`IconeCarneLeao`) — "Carnê-Leão do
   paciente gerado e enviado sem trabalho manual todo mês."
6. **Anamnese e documentos** (`IconeDocumentos`) — "Anamnese,
   prontuário e documentos organizados por paciente."

(Ícones já existem em `components/icons/NavIcons.js`, reuso direto.)

### 5. Preços (`id="precos"`)

Título: "Um plano pra cada momento do consultório". 4 cards, na ordem
Grátis → Psi Marketing → Psi Gestão → Psi Gestão + Marketing (esse
último com selo "Mais completo"), montados a partir de
`PLANOS` (`web/lib/planos.js`) — nome e preço vêm direto do objeto,
sem duplicar valor:

| Plano | Preço | O que mostra no card |
|---|---|---|
| Grátis | R$ 0 | Gestão básica, 1 consultório |
| Psi Marketing | R$ 39,90/mês | Perfil no diretório público, consultórios ilimitados |
| Psi Gestão | R$ 49,90/mês | Agenda, financeiro, documentos, lembrete WhatsApp, Carnê-Leão |
| Psi Gestão + Marketing | R$ 79,90/mês | Tudo do Psi Gestão + perfil no diretório público |

Cada card: nome, preço, 2-4 bullets (derivados das flags
`temGestao`/`temDiretorio`/`temDocumentos`/`temWhatsapp`/`temCarneLeao`/`limiteConsultorios`
— tradução estática em texto no componente, não precisa de função
genérica pra 4 planos fixos) e CTA "Começar" → `/cadastro?origem=home`
(mesmo destino do hero; sem pré-seleção de plano nesta entrega —
mudar `CadastroForm`/`PaginaCadastro` pra aceitar plano é fora de
escopo, o usuário escolhe o plano depois de criar a conta).

### 6. Depoimentos — estrutura pronta, **não renderizada**

Usuário decidiu adiar (sem depoimentos reais ainda — não fabricar
conteúdo atribuído a pessoa real). Deixar a seção **comentada** no
JSX de `page.js`, com o formato esperado documentado no comentário:

```jsx
{/* Depoimentos — aguardando conteúdo real do usuário (ver
    docs/superpowers/specs/2026-09-11-home-institucional-design.md).
    Formato esperado por item: { nome, cargo_ou_cidade, foto_url?, texto }.
<section id="depoimentos"> ... </section>
*/}
```

Não criar componente nem buscar dados pra isso agora — só o
comentário-guia, pra não haver estrutura morta rodando em produção.

### 7. Blog em destaque

Título: "Do blog". `listarArtigosPublicados()` (já existe, sem
alteração), pega os 3 primeiros (`.slice(0, 3)`) — array já vem
ordenado por `publicado_em desc`. Cards: capa (ou fallback de cor
sólida, mesmo padrão de `blog/page.js`), título, resumo. Cada card
linka pro artigo no subdomínio do blog
(`https://blog.psiagente.com.br/${slug}`). Se não houver nenhum
artigo publicado, a seção inteira não renderiza (sem estado vazio na
home — o "empty state" já existe dentro do próprio `/blog`).

### 8. FAQ

Título: "Perguntas frequentes". Conteúdo baseado só em recursos e
fluxos que já existem no código (nada inventado sobre política
comercial que eu não possa confirmar):

1. **Preciso de cartão de crédito para começar?** Não. O plano Grátis
   não pede cartão; você faz upgrade quando quiser.
2. **Já uso planilha ou outra agenda — dá pra migrar meus pacientes?**
   Sim, tem um assistente de importação que lê sua planilha de
   pacientes (`ImportarPacientesWizard`, modelo disponível pra baixar).
3. **O lembrete de sessão é automático?** Sim, por WhatsApp, nos
   planos Psi Gestão e Psi Gestão + Marketing.
4. **Posso usar em mais de um consultório na mesma conta?** Sim — nos
   planos pagos não há limite de consultórios.
5. **Posso cancelar quando quiser?** Sim, direto no painel, sem
   burocracia.
6. **Meus dados e os dos pacientes ficam seguros?** Sim — os dados
   ficam armazenados com controle de acesso e criptografia, seguindo
   os princípios da LGPD.

Implementado como `<details>`/`<summary>` nativos (acordeão sem JS,
sem lib nova) estilizados com as classes existentes.

### 9. CTA final

Mesmo padrão de `/comece` (fundo petróleo, "Pronto pra começar?",
botão âmbar "Criar conta grátis" → `/cadastro?origem=home`).

### 10. Footer institucional

- Logo + "PsiAgente".
- Links: Blog (`https://blog.psiagente.com.br`), Entrar (`/login`),
  Termos (`/termos`).
- WhatsApp: `IconeWhatsapp` + link
  `https://wa.me/5591981910295` (número informado pelo usuário),
  texto "Fale com a gente".
- Instagram: `@psiagente` → `https://instagram.com/psiagente`.
- "Criado por GESTÃO TECNOLOGIA" + "© {ano atual} PsiAgente" (sem
  CNPJ/endereço — decisão explícita do usuário).

### 11. Cookies

`<ConsentimentoCookies />` no fim da página, igual `/comece` (mesmo
componente, sem alteração).

## SEO

- `export const metadata` em `web/app/page.js`: title "PsiAgente —
  Gestão de consultório para psicólogos", description institucional
  (foco em busca orgânica, diferente da description mais "vendedora"
  que `/comece` teria se tivesse uma — hoje `/comece` não define
  `metadata` própria porque só existe como landing paga sem
  indexação; a home institucional precisa, já que é o destino
  orgânico principal). `openGraph.images` = `/og-default.png`
  (já existe).
- `web/app/sitemap.js`: adicionar a home (`origemBlog` já usa
  `NEXT_PUBLIC_BLOG_URL`; a home usa a origem do domínio principal —
  `process.env.NEXT_PUBLIC_SITE_URL ?? "https://psiagente.com.br"`)
  com `priority: 1`, antes das entradas de blog/busca.
- `web/app/robots.js`: conferir que `/` não está bloqueado (deve
  já estar liberado, é o comportamento padrão; só checar, sem mudança
  esperada).

## Testes

Sem framework automatizado (convenção já estabelecida no projeto).
Verificação por camadas:

1. **Middleware**: com o app rodando, acessar `/` deslogado e
   confirmar que NÃO redireciona pra `/login` (regressão do fix em
   `PUBLIC_PATHS`); acessar qualquer rota autenticada (ex: `/agenda`)
   deslogado e confirmar que CONTINUA redirecionando — a checagem
   exata da raiz não pode ter afrouxado o resto.
2. **Conteúdo**: `npm run build && npm run start` (nunca contra dev
   server, por diretriz do usuário) e navegar pela home: todas as
   âncoras (`#recursos`, `#precos`) rolam pro lugar certo, todos os
   links externos abrem o destino certo (WhatsApp abre conversa com o
   número certo, Instagram, blog cross-domain), botões "Entrar" e
   "Criar conta grátis" levam pras rotas certas.
3. **Responsividade**: menu mobile abre/fecha, grid de recursos e
   preços empilha em 1 coluna em telas pequenas, sem overflow
   horizontal.
4. **Regressão de `/comece`**: confirmar que a landing paga continua
   funcionando sem alteração (não é tocada nesta entrega, mas o
   middleware é compartilhado — vale conferir).
