# Status da implementação

Última atualização: 2026-08-14.

## Envio automático do Carnê-Leão (2026-08-13, item 9 do backlog)

Rota `POST /carne-leao-automatico` que o n8n chama periodicamente: pra cada
profissional com `carne_leao_frequencia` configurada (semanal/quinzenal/
mensal), gera o TXT do Carnê-Leão do período devido e devolve a lista
`enviar` (e-mail + arquivo em base64) pro n8n despachar por SMTP. Auditoria
de cada execução na tabela nova `EnvioAutomaticoCarneLeao` (service-role
only: sem grants pra anon/authenticated e com RLS sem policies, migration
`20260814000001_lockdown_envio_automatico_carne_leao.sql`).

- **Env var nova `CARNE_LEAO_CRON_SECRET`** — autentica a chamada do n8n pro
  app: a rota compara o header `x-cron-secret` com essa variável e devolve
  401 se não bater (é o único controle de acesso do endpoint, que não usa
  sessão de usuário). Precisa estar presente em **três lugares**, e só o
  primeiro é código:
  - `web/.env.local` — **já feito** (valor gerado na Task 6 desta branch);
  - **EasyPanel (produção)**, serviço do app Next.js — **pendente, manual**,
    mesmo procedimento já usado pra `SUPABASE_SERVICE_ROLE_KEY` (lida só em
    runtime, não entra no Dockerfile/build; exige restart do container);
  - **nó HTTP do workflow do n8n** — **pendente, manual**, como header
    `x-cron-secret` da requisição.

  Os três valores têm que ser idênticos; se o do n8n divergir do de
  produção, todo disparo vira 401 silencioso (nenhum e-mail sai e nada é
  registrado em `EnvioAutomaticoCarneLeao`, porque a rota rejeita antes de
  chegar no loop).
- **Horário do gatilho no n8n**: a rota calcula "hoje" em UTC (convenção do
  resto do app, ver `web/lib/periodo-agenda.js`), então o cron precisa
  disparar de manhã no horário de Brasília — nunca perto da meia-noite UTC
  (21h em Brasília), senão "hoje" pode virar o dia seguinte por engano perto
  de viradas de mês.

## Importação de pacientes via planilha + campo "Precisa de recibo" (2026-08-04)

Item 5 do backlog. Wizard em `/pacientes/importar`: upload `.xlsx`/`.csv`
→ escolher consultório → mapear colunas da planilha pros campos do
cadastro (com auto-detecção quando o cabeçalho bate) → prévia → confirmar.
Parsing 100% no navegador (SheetJS `xlsx`, instalado via CDN oficial da
SheetJS por causa de vulnerabilidades já corrigidas na versão travada no
registro npm). A Server Action `importarPacientes` valida e deduplica por
nome (contra pacientes já cadastrados e dentro da própria planilha),
pulando linhas sem nome ou duplicadas e deixando em branco campos de
data/valor em formato inválido — tudo reportado na tela de resultado.
`desfazerImportacao` apaga em lote os pacientes daquela leva específica,
se o profissional perceber algo errado depois de confirmar.

Junto, campo novo `Paciente.precisa_recibo` (nasce como `false` mesmo
pra pacientes já existentes, decisão explícita do usuário), editável no
cadastro manual e na planilha, que agora filtra `/recibos` — só sessões
de pacientes marcados como "Sim" aparecem como elegíveis.

## Diretório público: CTA de cadastro, termos de uso e divulgação (2026-08-04)

Extensão do item 2 (`busca.psifacil.com.br`, que já estava implementado
desde 2026-08-03/04 mas nunca tinha ganho uma seção aqui — corrigido
junto com esta entrega).

- **CTA "Cadastre-se grátis"** sempre visível no topo de `/busca`, link
  absoluto pra `https://psifacil.com.br/cadastro?origem=busca` (mesmo
  motivo do `comece.`: link relativo em subdomínio reescrito quebra).
  Quem se cadastra por esse caminho cai direto em `/diretorio` em vez do
  dashboard padrão (`cadastrar()` em `web/lib/actions/auth.js` lê o campo
  oculto `origem`).
- **Termos de Uso** (`/termos`, público, liberado em `PUBLIC_PATHS`):
  aceite obrigatório pra publicar, registrado com timestamp em
  `PerfilPublico.termos_aceitos_em` (sem versionamento — reforço futuro de
  consentimento seria por e-mail, não reabrindo esta coluna).
- **Barreira de qualidade**: `salvarPerfil` agora exige bio, foto e ao
  menos 1 especialidade pra `visivel_diretorio = true`, validado antes de
  qualquer escrita no banco — perfil incompleto continua podendo ser
  salvo como rascunho invisível.
- **Divulgação**: botão "Compartilhar meu perfil" em `/diretorio` (copia
  o link público pra área de transferência) e `openGraph.images` na
  página de perfil (`/busca/[slug]`) usando a foto do profissional.

## Landing page + autocadastro público (2026-08-04, item 4 + parte do item 3)

`comece.psifacil.com.br` — landing paga com CTA "Criar conta grátis", mesmo
padrão de subdomínio do `blog.` (rewrite no `web/proxy.js`, sem sitemap
dedicado pois é tráfego pago, não orgânico). Puxou junto a parte do item 3
que tinha ficado de fora: autocadastro público em `/cadastro`.

- **Migration nova**: `Usuarios` ganhou `aprovado boolean not null default
  true` (convite do admin e contas existentes continuam aprovadas
  automaticamente; só quem se cadastra sozinho entra como `false`) e `crp
  text` (coletado, sem verificação ainda).
- **`cadastrar()`** em `web/lib/actions/auth.js` usa `supabase.auth.signUp()`
  no client normal (nada de service-role, diferente do convite) — projeto
  tem `mailer_autoconfirm: true`, então a conta já sai confirmada e logada.
- **`aprovarProfissional()`** em `web/lib/actions/profissionais.js` também
  usa o client normal — a policy `usuarios_self` já é `for all` e já libera
  admin, não precisou de RLS nova.
- **Sem gate funcional por `aprovado`** nesta entrega — só um aviso no
  dashboard pro profissional pendente; nada é bloqueado (não existe item 2
  ainda pra esconder alguém pendente do diretório).
- **Testado de ponta a ponta com o chrome-devtools MCP**: cadastro real
  criado, logou automaticamente, aviso de pendência apareceu certo,
  confirmado no banco (`aprovado: false`, `role: psicologo`) e limpo depois.
  Landing conferida em desktop e mobile (390×844) — responsiva, sem
  problema de layout.
- **Sem prova social inventada** na landing (depoimento/nota/contagem de
  usuário) — nada disso existe de verdade ainda.
- Tracking (GA4/Google Ads) fica pronto mas inerte — `NEXT_PUBLIC_GA_MEASUREMENT_ID`/
  `NEXT_PUBLIC_GOOGLE_ADS_ID` não configurados ainda, banner de
  consentimento de cookies só aparece quando algum desses existir.
- **Falta**: DNS (`comece.psifacil.com.br` → `179.198.103.130`) e domínio no
  EasyPanel — mesmos 2 passos manuais já feitos pro blog, ainda não feitos
  pra esse subdomínio. Sem eles, só funciona local.

## Subdomínio do blog e queda do site — resolvido (2026-08-03)

`blog.psifacil.com.br` está no ar e confirmado de ponta a ponta (curl +
navegador via chrome-devtools MCP): site principal, subdomínio do blog,
redirect de `psifacil.com.br/blog`, `sitemap.xml` e `robots.txt` — todos
`200`/`308` conforme esperado. Registro do que aconteceu, pra não se repetir:

- **Nada tinha sido commitado até certo ponto desta sessão** — todo o
  trabalho (itens 3, 1, subdomínio, tooling) ficou só no working directory
  por um bom tempo, e só percebemos quando o subdomínio "não funcionava"
  mesmo com a infra certa (o `GIT_SHA` em produção continuava o mesmo de
  antes da sessão começar). Feitos 10 commits ao todo (ver `git log`) e
  `git push` em várias rodadas, conforme os problemas abaixo foram achados.
- **4 problemas encontrados e corrigidos, cada um exigindo um novo deploy**:
  1. EasyPanel com `PORT=80` em vez de `3000` — derrubou o site inteiro (502)
     até corrigir.
  2. Variável de ambiente digitada como `EXT_PUBLIC_BLOG_URL` (faltando o
     "N") — Next.js só expõe variável cujo nome comece exatamente com
     `NEXT_PUBLIC_`, ficou sendo ignorada até corrigir o nome.
  3. Registro DNS do `blog.psifacil.com.br` nunca tinha sido salvo de fato
     no Registro.br.
  4. `web/proxy.js` tinha dois bugs pequenos achados só testando em
     produção: o redirect do link antigo vazava a porta interna do
     container (`url.port = ""` resolveu), e o rewrite pro subdomínio
     prefixava `/sitemap.xml`/`/robots.txt` com `/blog` sem necessidade,
     dando 404 (esses dois arquivos só existem na raiz do app).
  5. **O mais sério**: depois de corrigir tudo isso, o site voltou a cair
     com 502 num deploy seguinte, sem nenhuma mudança óbvia de causa. Causa
     raiz real: o Docker define `HOSTNAME` automaticamente como o ID do
     container, e o `server.js` standalone do Next usa essa variável pra
     decidir em qual endereço escutar — como o container fica em mais de
     uma rede overlay, ele passava a escutar só numa delas (às vezes a que
     o Traefik usa, às vezes não, dependendo de qual IP calhava de ser
     atribuído no deploy). Corrigido de vez com `ENV HOSTNAME=0.0.0.0` no
     `web/Dockerfile` — confirmado via `netstat` dentro do container que
     agora escuta em todas as interfaces, então não deve voltar a acontecer
     em deploys futuros.
- O certificado SSL de `blog.psifacil.com.br` também não foi emitido
  automaticamente pelo Traefik/Let's Encrypt na primeira tentativa — resolvido
  removendo e adicionando o domínio de novo no EasyPanel (aparentemente
  Traefik só tenta emitir certificado novo em determinados gatilhos, não
  simplesmente por existir uma rota configurada).

## Pendências abertas

- **Item 3 (convite de profissionais)** e **item 1 (blog, CRUD admin)**:
  código pronto e validado por build/curl, mas **ainda não clicados de
  verdade no navegador**. Falta: enviar convite de teste em produção e
  conferir o e-mail; criar/editar um artigo pelo formulário de
  `/admin/artigos` (agora que o site está estável, dá pra fazer isso com o
  chrome-devtools MCP direto).
- **Item 5 novo no backlog**: importar pacientes via planilha Excel, com
  tela de mapeamento de colunas (`docs/backlog-novas-funcionalidades.md`).
- Depois dessas verificações, seguir pros itens 2 e 4 do backlog
  (`docs/backlog-novas-funcionalidades.md`, ainda não iniciados).

## Blog em subdomínio próprio: blog.psifacil.com.br (2026-08-03)

Blog migrado de `psifacil.com.br/blog` pra `blog.psifacil.com.br` — mesmo
app Next.js, roteamento inteiramente no `web/proxy.js` via header `Host`
(nenhum arquivo novo, nenhuma tela mudou de posição):

- Requisição em `blog.*` → `NextResponse.rewrite` (invisível pro navegador)
  pra dentro de `/blog/...`; **nunca chama `updateSession`** (o subdomínio é
  100% público, não precisa checar sessão do Supabase a cada pageview).
  Aceita tanto o caminho limpo (`/algum-artigo`) quanto o antigo
  (`/blog/algum-artigo`), então nada quebra por causa de link antigo.
- Requisição em `psifacil.com.br/blog*` (domínio principal) → redirect 308
  permanente pro mesmo caminho em `blog.psifacil.com.br`, sem o prefixo.
- Links internos do blog (`blog/layout.js`, `blog/page.js`) viraram
  "limpos" (sem `/blog`), e `blog/[slug]/page.js` ganhou
  `alternates.canonical`/`openGraph.url` — importante porque agora duas
  URLs (`/x` e `/blog/x`) respondem o mesmo conteúdo no mesmo host.
- `sitemap.js`/`robots.js` continuam sendo um arquivo só na raiz do app
  (confirmado no doc oficial do Next 16: não existe convenção de
  sitemap/robots aninhado por segmento de rota) — só trocaram
  `NEXT_PUBLIC_SITE_URL` por `NEXT_PUBLIC_BLOG_URL` e as URLs viraram
  limpas. Isso significa que `psifacil.com.br/sitemap.xml` também responde
  com o mesmo conteúdo do blog — inofensivo, só o de `blog.psifacil.com.br`
  vai ser submetido no Search Console.
- **Testado localmente** com `curl -H "Host: blog.localhost:3000" ...`
  (rewrite, redirect do domínio principal, sitemap, robots — todos ok).
  **Não testado em produção ainda** — faltam 3 passos manuais:
  1. DNS (Registro.br): registro A `blog.psifacil.com.br` → `179.198.103.130`
     (mesmo padrão de `psifacil.com.br`/`www`, não existe ainda).
  2. EasyPanel: adicionar `blog.psifacil.com.br` como domínio do mesmo
     serviço (aba Domains) — Traefik rotea e emite SSL sozinho.
  3. EasyPanel: build-arg `NEXT_PUBLIC_BLOG_URL=https://blog.psifacil.com.br`
     no mesmo lugar onde `NEXT_PUBLIC_SITE_URL` já está — dispara rebuild.

## Blog público (2026-08-03, item 1 do backlog)

Primeira área do app acessível sem login. Tabela nova `public.artigos`
(migration `20260803000001_add_artigos_blog.sql`, convenção snake_case já
usada nas tabelas do agente de WhatsApp, diferente do legado PascalCase),
RLS reaproveitando `public.is_admin()`: leitura liberada (inclusive pra
`anon`) quando `publicado = true`, escrita só admin.

- **Conteúdo em Markdown**, renderizado com a lib nova `marked` (zero
  dependências, dependência deliberada e pequena — alternativa seria HTML
  cru no textarea, mas piora a experiência de quem escreve).
- **Painel admin** (`/admin/artigos`) reaproveita o `/admin` do item 3 —
  `web/app/(app)/admin/layout.js` ganhou uma sub-nav (Profissionais/Blog).
- **Público**: `/blog` (lista) e `/blog/[slug]` (artigo), fora do
  `(app)`/`(auth)` — layout próprio sem nav interno. `web/lib/supabase/proxy.js`
  (`PUBLIC_PATHS`) liberou `/blog`, `/sitemap.xml` e `/robots.txt`.
- **SEO básico**: `web/app/sitemap.js` (lista artigos publicados,
  `revalidate = 3600` pra não depender de redeploy pra atualizar) e
  `web/app/robots.js` (libera só `/blog` pro crawler, bloqueia o resto do
  app — é um painel de gestão privado, não devia ser indexado).
- Sem upload de imagem nesta entrega — Markdown aceita `![alt](url)`
  hotlink; upload de verdade (Supabase Storage) fica pra depois se precisar.
- **Testado de ponta a ponta localmente** (`npm run dev` + `curl`, inserindo
  artigo de rascunho e um publicado direto no banco): rascunho não aparece
  em `/blog` nem no sitemap e dá 404 em `/blog/[slug]`; publicado aparece
  nos dois lugares e o Markdown renderiza corretamente (negrito, lista,
  link). Dados de teste removidos depois. **Não testado ainda passando
  pelo formulário de admin de verdade no navegador.**

## Painel admin — convidar profissionais (2026-08-03, item 3 do backlog, parte 1)

A pedido do usuário, primeira entrega de `docs/backlog-novas-funcionalidades.md`
item 3 — só o fluxo de **convite** (autocadastro público fica pra depois), pra
já poder trazer profissionais de verdade pra testar o sistema.

- **`Usuarios.role`/`public.is_admin()`** já existiam no banco (migration
  `20260727000003_enable_rls_policies.sql`) sem nenhum código de app usando —
  agora usados de verdade. `role = 'admin'` setado manualmente na única linha
  existente (`id = 1`, e-mail não estava preenchido nessa linha — dado legado).
- **Novo client service-role** (`web/lib/supabase/admin.js`) — só ele chama
  `auth.admin.inviteUserByEmail`. Env var nova `SUPABASE_SERVICE_ROLE_KEY` em
  `web/.env.local` (chave `sb_secret_...`, par da `sb_publishable_...` já
  usada) — **já adicionada também no EasyPanel (produção)**, serviço do app
  Next.js, confirmado pelo usuário (não entra no Dockerfile/build, é lida só
  em runtime; site respondeu HTTP 200 depois do restart do container).
- **Ponto de segurança:** diferente do resto do app (que confia 100% em RLS),
  a action `convidarProfissional` (`web/lib/actions/profissionais.js`) precisa
  checar `role === 'admin'` explicitamente antes de qualquer coisa, porque o
  client service-role que ela usa ignora RLS por completo.
- **Fluxo do convidado reaproveitado 100%** do que já existia: o e-mail de
  convite do Supabase leva pro mesmo `/auth/callback` → `/redefinir-senha` já
  usado por recuperação de senha — nenhuma tela nova precisou ser criada pro
  profissional convidado.
- Novo: `web/app/(app)/admin/{layout.js,profissionais/page.js,profissionais/novo/page.js}`,
  `web/lib/data/profissionais.js`, `web/components/ConvidarProfissionalForm.js`.
  Link "Administração" no nav (`web/app/(app)/layout.js`) só aparece pra quem
  tem `role = 'admin'`.
- **SMTP próprio configurado** — usuário criou conta no Resend, verificou o
  domínio `psifacil.com.br` e gerou uma API key; apliquei a config no
  Supabase Auth via Management API (`PATCH /v1/projects/rohulajgyxdangxfurha/config/auth`):
  `smtp_host=smtp.resend.com`, `smtp_port=465`, `smtp_user=resend`,
  `smtp_sender_name=PsiFácil`, `smtp_admin_email=no-reply@psifacil.com.br`.
  Também subi `rate_limit_email_sent` de 2 (limite do mailer de teste) pra
  30/hora — sem isso o limite continuaria valendo mesmo com SMTP próprio.
  **Ainda não confirmado**: se o domínio já apareceu "Verified" no Resend no
  momento em que isso for testado de verdade (a config foi aplicada antes de
  confirmar o status de verificação).
- **Validado só por `npm run build`** — ainda não testado enviando um convite
  de verdade e completando o fluxo no navegador (ver seção "Estado da sessão"
  no topo deste arquivo pro que falta e por quê).

## PsiFácil em produção (2026-07-29/30)

App publicado: VPS Hostinger (179.198.103.130) via EasyPanel (Docker + Traefik,
SSL automático), domínio `psifacil.com.br` (DNS apontado pro Registro.br),
código em `github.com/carlosventto-afk/psicologia` (privado). Deploy via
Dockerfile (`web/Dockerfile`, `output: "standalone"` no `next.config.mjs`),
build context na raiz do repo (não em `web/` — detalhe importante pro
EasyPanel, ver campo "Arquivo" = `web/Dockerfile` na config do serviço).
Supabase Auth `SITE_URL`/`URI_ALLOW_LIST` atualizados pro domínio novo.

## Agente de WhatsApp — Fase A em andamento (2026-07-30)

Retomado o plano do agente de WhatsApp (arquitetura completa em
`C:\Users\Administrador\.claude\plans\preciso-criar-um-ecossistema-tidy-bachman.md`):
secretário do psicólogo (todos os campos do sistema + resumo diário
proativo) + canal opcional do paciente (consulta + solicitação de
reagendamento/cancelamento, sujeita a aprovação do psicólogo). n8n será
self-hosted via EasyPanel no mesmo VPS (não Railway).

**Mudança de canal em relação ao plano original**: em vez da WhatsApp Cloud
API oficial (Meta), o usuário optou por **Evolution API self-hosted** no
mesmo VPS/EasyPanel — decisão tomada cientemente do risco de banimento do
número (violação dos Termos de Serviço do WhatsApp), documentado no plano.

**Concluído nesta entrega (parte da Fase A — fecha o loop de vinculação):**
- Migration `20260730000001_whatsapp_agent_onboarding.sql` — RPCs
  `gerar_codigo_verificacao_whatsapp` (authenticated, chamada pelo Next.js)
  e `validar_codigo_whatsapp` (service_role, futura chamada pelo n8n).
- Tela `/configuracoes/whatsapp` (`VincularWhatsappForm.js`) — psicólogo
  gera um código de 6 dígitos válido por 10 minutos pra vincular o número.
- Serviço **Evolution API** (`evoapicloud/evolution-api:v2.3.7`) publicado
  no EasyPanel (projeto `psifacil`), com Postgres e Redis próprios,
  domínio automático `psifacil-evolution-api.lcuzxl.easypanel.host`.
  Instância `psifacil` criada e pareada com sucesso com um número dedicado
  (não é o WhatsApp pessoal do usuário — decisão deliberada pra não
  arriscar o acesso pessoal a cada tentativa de pareamento).
- **Incidente registrado durante o pareamento**: a primeira tentativa
  conectou, sincronizou contatos/conversas, passou por um `stream:error
  code 515` (normal no protocolo) e então caiu com `403 Forbidden
  ("Connection Failure")` na reconexão, ficando desconectada por ~20min
  sem se recuperar sozinha. É exatamente o tipo de sinal de bloqueio já
  documentado como risco aceito no plano — possivelmente relacionado ao IP
  de datacenter do VPS. Mitigação aplicada: apagar a instância
  (`/instance/delete`), recriar do zero, e parear de novo com cuidado pra
  não gerar múltiplos QR codes em sequência (evitar de novo o rate
  limit/suspeita) — a segunda tentativa conectou com sucesso (`status:
  open`, sem erro de desconexão). Se o número cair de novo no futuro, essa
  mesma sequência (delete → create → connect coordenado) é o primeiro
  passo de recuperação; se voltar a falhar repetidamente, considerar a
  mitigação de proxy residencial (`PROXY_HOST`/`PROXY_PORT` já suportados
  pela imagem) ou reavaliar a decisão de canal (ver seção de riscos do
  plano).

**Ainda faltando pra Fase A estar completa:** n8n publicado no EasyPanel,
workflow `WA - Inbound Router` + `WA - Agent Psicólogo` (com as 11 tools
já existentes), transcrição de áudio (Whisper), wrapper de log em
`agent_audit_log`. Os 3 textos de mensagem já redigidos
(`docs/whatsapp-message-templates.md`) não precisam mais de aprovação de
template — com Evolution API viram apenas texto livre.

### 5 tools novas + correções da revisão final (2026-08-17)

Implementado o design de `docs/superpowers/specs/2026-08-17-agente-whatsapp-profissional-design.md`
(item 13 do backlog): 5 tools novas —
`agent_reagendar_sessao`, `agent_excluir_sessao`, `agent_excluir_pagamento`,
`agent_registrar_lancamento_despesa`, `agent_registrar_anamnese` — mais a
tabela `SessaoReagendamento`, elevando o total de 11 pra **16 tools**.
Migrations `20260817000001` a `20260817000010`: as primeiras seis
(`...001` a `...006`) implementam schema + as 5 funções; `...007` a
`...010` são a rodada de correções da revisão final do branch —
`agent_registrar_anamnese` ganhou guarda contra linha fantasma (chamada
vazia num paciente sem anamnese não cria mais registro), trim/normalização
de string vazia pra `null` nos 11 campos, e validação de `p_campos`
malformado; `agent_excluir_pagamento` passou a capturar violação de FK
vinda de `NotaFiscal` (item 7/NFS-e) como `PAGAMENTO_TEM_NOTA_FISCAL` em
vez de erro cru; `agent_reagendar_sessao` corrigiu o guard de
`"Realizado"` pra tratar `NULL` como reagendável (dado legado) e passou a
bucketizar o contador mensal em horário de Brasília em vez de UTC, além de
ganhar índice em `SessaoReagendamento.sessao`. Também removidos 9 registros
de teste deixados em produção por verificações anteriores (3 `Paciente` +
3 `Sessao` + `SessaoReagendamento` em cascata, todos com `owner`/`consultorio`
nulos, portanto inertes mas não deveriam existir).

### Rota `/api/agent/call-tool` + correções da revisão final (2026-08-19)

Migration aplicada no banco real: correção em `_agent_resolve_consultorio`
mais a RPC nova `agent_definir_consultorio_ativo`. A rota Next.js
`POST /api/agent/call-tool` (o proxy que o futuro workflow do n8n vai
chamar pra executar as 18 tools do agente) está **commitada na `main` mas
ainda não implantada** — o deploy deste projeto é por clique manual no
EasyPanel, e ainda não houve esse clique pra esta branch. Ou seja: agora
mesmo, mesmo com a env var abaixo ausente em produção, nada quebra, porque
nada chama essa rota ainda.

- **Env var nova `AGENT_TOOL_SECRET`** — autentica a chamada do n8n pro
  app: a rota compara o header `x-agent-secret` com essa variável e devolve
  401 se não bater (é o único controle de acesso do endpoint, que não usa
  sessão de usuário). Precisa estar presente em **dois lugares**:
  - **EasyPanel (produção)**, serviço do app Next.js — a ser configurada
    quando o app for implantado;
  - **nó HTTP Request Tool do workflow do n8n** (ainda não construído —
    parte da "metade 2b" do plano do agente), como header `x-agent-secret`
    da requisição.

  Os dois valores têm que ser idênticos; se divergirem, todo disparo vira
  401 silencioso — e, nesse caso, nem chega a gravar linha em
  `agent_audit_log`, porque a rota rejeita antes de chegar no insert
  (mesmo formato de falha já documentado acima pra
  `CARNE_LEAO_CRON_SECRET`).

## Nova funcionalidade: sessões recorrentes (Semanal/Quinzenal/Mensal)

A pedido do usuário, "Nova Sessão" agora suporta recorrência: ao escolher **Tipo de Atendimento** = Semanal/Quinzenal/Mensal (em vez de Avulso), o sistema cria a sessão + uma série (`Recorrencia`) + todas as próximas ocorrências até ~3 meses à frente. Não existe uma "data final" escolhida pelo usuário — a recorrência é indefinida até ser cancelada, e o sistema sempre mantém ~3 meses de sessões futuras geradas.

- **Migration:** `20260729000001_add_recorrencias.sql` — tabela `Recorrencia` (paciente, frequência, horário, `data_inicio`, `gerado_ate`, `ativa`) + RLS igual ao padrão das demais tabelas + `Sessao.recorrencia_id` (nullable, null = sessão avulsa).
- **Geração de datas:** `web/lib/recorrencia.js` — `calcularProximaData` (soma 7/14 dias ou 1 mês com *clamp* pro último dia do mês em recorrência mensal), `gerarSessoesAteHorizonte`, `garantirRecorrenciasEstendidas`.
- **Renovação automática:** como o app não tem um scheduler/cron de verdade rodando ainda, a renovação é "preguiçosa" — `garantirRecorrenciasEstendidas()` é chamada no carregamento de Agenda e Painel, e estende qualquer recorrência cujo `gerado_ate` esteja a menos de 3 meses de hoje. **Quando o app for implantado de verdade, vale trocar isso por um cron real** (Vercel Cron ou Supabase `pg_cron`) chamando a mesma função — a lógica já está pronta pra isso, só falta o agendamento externo.
- **Cancelar recorrência:** tela nova `/recorrencias` (link no menu) lista as séries ativas com botão "Cancelar recorrência" — cancela todas as sessões futuras não realizadas da série de uma vez; sessões passadas/realizadas não são tocadas.
- **Financeiro:** extraído `calcularPrevisto()` (antes só existia inline no Painel) e reaproveitado também na tela Financeiro, que ganhou um card "Previsto (mês)" — assim as sessões futuras geradas pela recorrência aparecem como valor provisório do mês, não só do dia. **Bug corrigido durante a implementação:** o filtro inicial usava `status <> 'Cancelada'`, que por semântica de NULL do SQL excluiria sessões antigas com `status` nulo (dado legado) — trocado por um `or()` explícito incluindo status nulo.
- **Label renomeado:** "Dimensão de atendimento" → "Tipo de Atendimento" no formulário de Pacote (só o texto exibido; a coluna `dimensao_atendimento` no banco continua com esse nome).

**Não testado no navegador ainda** — só validado por `npm run build`. Vale testar: criar uma sessão Semanal e conferir se a série aparece em `/recorrencias` e se as próximas datas em `/agenda` estão corretas; testar o caso de recorrência mensal começando num dia 29/30/31 (mês curto pela frente); cancelar uma recorrência e confirmar que só as sessões futuras somem.

## Edição de sessão a partir do Painel/Agenda (2026-07-29)

A pedido do usuário: no Painel, a lista "Atendimentos de hoje" agora mostra **horário → nome → status** (antes era nome → horário → status), e cada linha é clicável, levando para `/sessoes/[id]/editar`.

- **Nova tela `/sessoes/[id]/editar`** (`SessaoEditForm.js`): permite alterar paciente, data, horário, duração e tipo de atendimento de uma sessão pontual, e tem um botão "Cancelar esta sessão".
- **Decisão de design:** "excluir" foi implementado como **cancelamento** (`status = 'Cancelada'`), não como `DELETE` de verdade — segue o mesmo padrão já usado em `/recorrencias` e é mais seguro, já que uma sessão realizada pode ter `PagamentoSessao`/`Recibo`/`LancamentoFinanceiro` vinculados por chave estrangeira (um `DELETE` de verdade falharia nesses casos). Editar uma sessão individual não afeta a recorrência/série a que ela pertence.
- **Novas Server Actions** em `lib/actions/sessoes.js`: `atualizarSessao(sessaoId, ...)` e `cancelarSessao(sessaoId)`.
- A tela `/agenda` também ganhou um link "Editar" em cada linha (além dos já existentes "Registrar Atendimento"/"Registrar Pagamento").
- Validado só por `npm run build` — ainda não testado no navegador.

## Agenda com visualização em calendário (2026-07-29)

A pedido do usuário (referência visual: um app de calendário estilo Kanban semanal), a tela `/agenda` ganhou navegação por período e duas novas visualizações:

- **Navegação:** botões "‹ Hoje ›" acima das abas Dia/Semana/Mês, deslocando a data-base por 1 dia/7 dias/1 mês (`deslocarData` em `lib/periodo-agenda.js`) e mostrando o período atual por extenso (`formatarRotuloPeriodo`).
- **Visão Semana** (`components/AgendaGrade.js`): grade de colunas (uma por dia), cada uma com cartões coloridos por status (azul = Marcada, verde = Realizada, cinza/riscado = Cancelada), clicáveis para `/sessoes/[id]/editar`.
- **Visão Mês** (`components/AgendaMes.js`): grade de calendário tradicional (semanas × 7 dias, incluindo dias de padding do mês anterior/seguinte), até 3 sessões por célula + "+N mais"; clicar num dia leva para a visão Dia daquela data.
- **Visão Dia:** mantida como lista detalhada (não virou grade) porque é onde ficam as ações "Registrar Atendimento"/"Registrar Pagamento"/"Editar" — a visão Semana/Mês é só pra navegação/visão geral, sem cramar esses botões em cartões pequenos.
- Cores seguem a paleta já existente do app (azul `--color-primary`, navy, muted, verde/vermelho já usados em outras telas para status) — não foram introduzidas cores novas do print de referência.

Validado só por `npm run build` — ainda não testado no navegador.

## Nome do produto — DEFINIDO: PsiFácil (2026-07-29)

O usuário já contratou o domínio `psifacil.com.br` — nome definitivo, substituindo "Sua Terapia" (as 5 sugestões anteriores — Ecoa, Acolha, Vivaz, Zelora, Enraíza — ficam registradas na seção 3 do plano arquitetural só como histórico, não foram usadas).

- Atualizado `web/app/layout.js` (title/metadata) e o cabeçalho do app (`web/app/(app)/layout.js`) e as 3 telas de auth (login/esqueci-senha/redefinir-senha) pra mostrar "PsiFácil" em vez de "Sua Terapia".
- **Logotipo:** criado um placeholder simples em `web/public/logo.svg` (símbolo Ψ + tipografia "PsiFácil", cores da paleta), já em uso no cabeçalho e nas telas de login/recuperação de senha. É só um wordmark SVG gerado por código — não tenho ferramenta de geração de imagem, então se o usuário quiser algo mais elaborado (ícone ilustrado, variações de marca) vai precisar de um designer ou ferramenta de IA de imagem à parte.
- Nomes de tabela/schema no Supabase continuam com nomenclatura antiga (ex: `Usuarios`, `Consultorio`) — isso é interno, não precisa mudar por causa do rebrand.

## Visão geral: dois projetos paralelos no mesmo Supabase

1. **Agente de WhatsApp** (arquitetura completa no plano, seções 1-4) — n8n + Claude + WhatsApp Cloud API + RPC functions `security definer`. Schema/RPCs/RLS já aplicados no banco real (ver abaixo). O n8n em si (a orquestração) **ainda não foi construído** — só a base de dados está pronta para receber esse trabalho.
2. **App Next.js** (`web/`, plano seção 5) — substitui o FlutterFlow por completo. **As 19 telas do PRD original estão implementadas e o build passa limpo.** Falta testar boa parte disso no navegador de verdade (ver "O que ainda precisa de teste manual" abaixo).

Os dois acessam o mesmo Supabase (projeto `rohulajgyxdangxfurha`) por caminhos diferentes: o app Next.js sempre como `authenticated` (RLS protege), o agente de WhatsApp sempre como `service_role` via RPC functions — nunca se misturam.

## O que já foi feito no Supabase (aplicado no banco real)

Migrations aplicadas com sucesso em `rohulajgyxdangxfurha` (arquivos em `supabase/migrations/`):

- `20260727000001_add_whatsapp_agent.sql` — `whatsapp_number`/`whatsapp_verified` em `Usuarios`, tabela `whatsapp_verificacao_codigos`, `agent_sessions`, `agent_audit_log`, `lembretes_enviados`, opt-in em `Paciente`, tabela nova `Recibo` (não existia antes).
- `20260727000002_create_agent_rpc_functions.sql` — as 12 RPC functions (11 tools do agente + helper), exclusivas de `service_role`.
- `20260727000003_enable_rls_policies.sql` — RLS habilitada em todas as 10 tabelas reais + `Recibo`, políticas por `owner = auth.uid()` (com bypass admin), tratamento especial para `PagamentoSessao`/`Usuarios`/lookups, `default auth.uid()` na coluna `owner` de todas as tabelas que a têm, `security_invoker` na view `v_resumo_financeiro_mensal`.
- `20260727000004_lockdown_agent_tables.sql` — correção de segurança encontrada durante a verificação: as 4 tabelas novas da migration 000001 tinham grant total (select/insert/update/delete/truncate) aberto para `anon`/`authenticated` por padrão do Supabase. Revogado + RLS habilitada (deny-all) nessas 4 tabelas.
- `20260727000005_fix_text_casing.sql` — correção encontrada ao construir a Fase 4 do app: as funções `agent_registrar_pagamento_sessao`, `agent_marcar_atendimento_realizado`, `agent_agendar_sessao_avulsa` e `agent_cancelar_sessao` escreviam `'receita'`/`'realizada'`/`'cancelada'`/`'marcada'`/`'avulso'` em minúsculo, mas a convenção real do banco (confirmada nos dados existentes) é capitalizada: `'Receita'`/`'Despesa'`, `'Avulso'`/`'Semanal'`/etc., e a view `v_resumo_financeiro_mensal` soma por `tipo = 'Receita'` exato. Sem essa correção, pagamentos/sessões registrados pelo agente de WhatsApp ficariam invisíveis pro resumo financeiro e incoerentes com o que o app Next.js escreve.

**Verificação feita e confirmada** (scripts em `scripts/verificar_rls*.mjs`, `scripts/diagnostico_*.mjs` — mantidos como referência/documentação do que foi checado):
- RLS isola corretamente por usuário (paciente real = 3 resultados logado como o dono; 0 resultados logado como UUID aleatório).
- Tentativa de inserir um registro com `owner` de OUTRO usuário válido é bloqueada pela policy (não só pela FK).
- Default `auth.uid()` preenche `owner` automaticamente quando o insert não especifica.
- Grants abertos nas tabelas do agente foram fechados e reconfirmados.

**Schema real do banco** (divergente do documentado no PDF do PRD original — ver seção 5 do plano arquitetural para o mapeamento completo): tabelas em PascalCase com aspas duplas, IDs `bigint` (não uuid), ownership via coluna `owner` direta na maioria das tabelas, valores de texto tipo enum capitalizados (`'Receita'`, `'Avulso'`, `'Realizada'`...).

## App Next.js (`web/`) — as 19 telas do PRD, completas

Scaffold: Next.js 16.2.12 (App Router, JavaScript puro, Tailwind CSS, `@supabase/ssr`), rodando em `web/` com `package.json` próprio.

**Atenção para quem continuar isto depois:** essa versão do Next.js é mais nova que o comum — o arquivo de proxy/middleware se chama **`proxy.js`** (não `middleware.js`, que foi descontinuado), e funções como `cookies()`/`params`/`searchParams` são assíncronas (`await`). Antes de mexer em rotas/auth, vale reler `web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.

### Estrutura por área

- **Auth**: `proxy.js` + `lib/supabase/{client,server,proxy}.js`, login/logout/esqueci-senha/redefinir-senha (`app/(auth)/...`, `lib/actions/auth.js`), `app/auth/callback/route.js`.
- **Layout**: `app/(app)/layout.js` com nav + seletor de consultório ativo via cookie simples (`lib/consultorio-ativo.js`, sem tabela nova).
- **Consultórios**: lista/novo/editar (`app/(app)/consultorios/...`).
- **Pacotes de Cobrança**: lista/novo/editar, usando os lookups `TipoAtendimento`/`TipoCobranca` (`app/(app)/pacotes/...`).
- **Pacientes**: lista com busca e "próxima sessão", novo, detalhe com histórico de sessões, editar (`app/(app)/pacientes/...`). Campo "Consultório" removido do form de Novo Paciente — usa o consultório ativo do seletor global (simplificação intencional vs. PRD original).
- **Agenda**: abas dia/semana/mês, Nova Sessão (tipo pré-preenchido pelo pacote do paciente), Registro de Atendimento, links contextuais de "Registrar Pagamento" quando já realizada (`app/(app)/agenda/...`, `app/(app)/sessoes/[id]/registrar`).
- **Painel Inicial**: atendimentos do dia reais + "previsto" calculado; "realizado"/"inadimplentes" ficaram sem dado até a Fase 4 existir, agora já preenchidos.
- **Financeiro**: Contas (lista/nova), Lançamentos (lista com filtros conta/tipo/período, novo), Pagamento da Sessão (gera `LancamentoFinanceiro` + `PagamentoSessao` automaticamente), Financeiro (resumo do mês via `v_resumo_financeiro_mensal` + lista de inadimplentes) — `app/(app)/financeiro/...`, `app/(app)/sessoes/[id]/pagamento`.
- **Recibos**: lista de sessões elegíveis (realizada + sem recibo ainda) com botão gerar, + lista de recibos já emitidos (`app/(app)/recibos`).

### Decisões/padrões que valem saber antes de mexer

- **Nenhum insert seta `owner` explicitamente** — todas as tabelas relevantes têm `default auth.uid()` (migration 000003), e a policy de RLS aceita o valor do default. Isso é uma simplificação real em relação ao que o plano original recomendava ("sempre setar owner explícito no código"); funciona porque o default é aplicado antes da checagem de RLS.
- **`Sessao` não tem coluna `consultorio`** — todo filtro por consultório ativo em sessões passa por um embed `Paciente!inner(...)` do PostgREST.
- **`PacoteCobranca.dimensao_atendimento`/`dimensao_cobranca` não têm FK declarada** — o embed automático do PostgREST não funciona aí; `lib/data/pacotes.js` busca os lookups à parte e cruza na aplicação.
- **Textos-enum são capitalizados** (`'Receita'/'Despesa'`, `'Marcada'/'Realizada'/'Cancelada'`, `'Avulso'/'Semanal'/...`, `'Dinheiro'/'Pix'/'Cartão'`) — confirmado contra dados reais existentes, não assumido do PRD (que usava minúsculo). `Sessao.status` de sessões antigas está `null` — o código trata `status` ausente como "ainda pendente" (mesmo efeito de "Marcada"), não força comparação exata.
- **`ContaFinanceira.tipo`** é texto livre na prática (dados de teste têm `"Pacote Básico"`/`"Conta Corrente"`, sem relação com o enum do PRD) — o form novo usa "Conta Corrente"/"Conta Poupança" como convenção daqui pra frente, sem alterar dados antigos.

## O que já foi testado no navegador (pelo usuário) vs. só testado por build

**Testado e funcionando de verdade:** login, seletor de consultório, cadastro/edição de consultório (Fase 1). Durante esse teste, 2 bugs reais foram encontrados e corrigidos:
- Sobrou `web/app/page.js` (boilerplate do `create-next-app`) conflitando com `web/app/(app)/page.js` — os dois mapeavam pra `/`. Removido.
- Recuperação de senha falhava porque `uri_allow_list` do Supabase Auth só tinha o domínio do FlutterFlow. Adicionado `http://localhost:3000/*` via Management API (mantendo a entrada do FlutterFlow).

**Só validado por `npm run build` (compilação/tipagem OK), NÃO testado clicando no navegador:** Pacotes, Pacientes, Agenda, Nova Sessão, Registro de Atendimento, Painel Inicial real, Contas, Lançamentos, Pagamento da Sessão, Financeiro, Recibos. Build limpo garante que o código compila e as rotas existem — não garante que a lógica de negócio bate com o que o usuário espera na tela. Recomendo testar cada uma na sequência das fases antes de considerar isso "pronto".

**Achado, não corrigido ainda:** o template de e-mail de recuperação de senha configurado no Supabase tem um bug — `{{ .ConfirmationURL }}LoginRedefinirSenha` concatena texto direto na URL sem separador, o que provavelmente quebra o link em produção também. Revisar em Supabase → Authentication → Email Templates → Reset Password.

**Atenção para produção:** o projeto usa o mailer de teste embutido do Supabase (limite de 2 e-mails/hora) — precisa de SMTP próprio (Resend, Postmark etc.) antes do lançamento real.

## Configuração desta sessão (fora do código do produto)

- `C:\Users\Administrador\.claude\CLAUDE.md` (global, todos os projetos): diretriz de usar agentes de maior potencial só pra orquestração e delegar execução a agentes mais custo-efetivos.
- `Psicologia/.claude/settings.json` (só este projeto): `permissions.allow: ["PowerShell"]` — comandos PowerShell não pedem mais aprovação individual aqui.

## Bug real encontrado no teste manual (Fase 2-5): ids bigint como string

Ao testar Pacientes/Painel no navegador, apareceu erro `invalid input syntax for type bigint: "null"` e depois listas vazias mesmo com dados existentes. Causa raiz: o Supabase devolve colunas `bigint` como **string** em JSON (para não perder precisão), mas várias comparações no código faziam `Number(cookie/select) === id_vindo_do_banco`, e `3 === "3"` é sempre `false` em JavaScript. Isso quebrava silenciosamente: o seletor de consultório sempre voltava pro primeiro da lista (nunca respeitava a troca), o preenchimento automático de valor/tipo pelo pacote, e filtros por consultório.

Corrigido criando `web/lib/normalizar-ids.js` (converte campos de id pra `Number` logo ao ler do banco) e aplicando em todas as funções de `lib/data/*.js`, além de criar `getConsultorioAtivoResolvido()` em `lib/consultorio-ativo.js` (resolve cookie → primeiro consultório como fallback, usado por toda página que precisa do consultório ativo — antes só o layout tinha esse fallback, as páginas filhas usavam o cookie cru). De quebra, também corrigi `listarPacientes` pra considerar sessões com `status` nulo (dado legado) como pendentes em vez de exigir `status = 'Marcada'` exato.

Também descoberto: existem hoje **4 consultórios** (Botafogo, CENTRO, Macapá, Tijuca) e **4 pacientes**, sendo que 2 pacientes têm `consultorio = null` (dado legado, de antes desta sessão) — não aparecem em nenhuma lista por consultório até alguém editar e vincular um consultório a eles.

## Novo design system (2026-07-28), baseado em `Telas de modelo/`

O usuário pediu pra seguir o padrão visual dos mockups em `Telas de modelo/` (case de um app mobile de saúde, com uma tela de "Style Guide" explícita) em todas as telas do app daqui pra frente. Tokens extraídos direto do style guide:

- **Fonte:** Nunito (carregada via `@import` de Google Fonts no `globals.css` — não usei `next/font/google` porque esse build/ambiente não tem acesso de rede pra baixar fontes em tempo de build; `@import` funciona porque quem busca a fonte é o navegador do usuário, não o servidor).
- **Cores:** azul `#7FB2EE` (primário/botões), navy `#253041` (títulos/texto forte), cinzas `#949AA9` (texto secundário) e `#D2DBED` (bordas), fundo `#EBECEF`, superfícies brancas.
- **Componentes compartilhados** criados em `web/app/globals.css` (`@layer components`): `.page-title`, `.card`, `.field`, `.btn-primary`, `.btn-outline`, `.btn-dark`, `.link`, `.empty-state` — botões em formato pílula, cards com cantos bem arredondados e sombra leve, inputs arredondados, como nos mockups.
- Todas as ~20 telas e formulários já construídos foram migrados pra usar essas classes (troca mecânica das classes Tailwind antigas por essas novas, via busca e substituição em massa — sem mudar a estrutura/lógica de nenhuma tela).
- **Não verificado visualmente por mim** (sem navegador neste ambiente) — só validado que o build compila sem erro. Vale abrir no navegador e conferir se o resultado visual está bom antes de seguir construindo coisas novas em cima desse padrão.
- Esse padrão (classes `.page-title`/`.card`/`.field`/`.btn-primary`/etc.) deve ser reaproveitado em qualquer tela nova construída daqui pra frente, em vez de reescrever Tailwind cru.

## Pedido do usuário: remoção do seletor/filtro de consultório (2026-07-28)

A pedido explícito, removido todo o mecanismo de "consultório ativo": o seletor no menu, o cookie que guardava a escolha, e o filtro por consultório em Pacientes/Agenda/Painel/Financeiro/Recibos. Agora essas telas mostram **tudo** do usuário logado (todos os consultórios juntos), sem esconder nada. Arquivos deletados: `web/components/ConsultorioSelector.js`, `web/lib/consultorio-ativo.js`, `web/lib/actions/consultorio-ativo.js`.

O campo "Consultório" **voltou** a aparecer (obrigatório) no formulário de Novo/Editar Paciente — assim o dado continua sendo registrado, só não é mais usado pra filtrar nada agora. A geração de recibo (`gerarRecibo`) passou a derivar o consultório automaticamente a partir do paciente da sessão, em vez de depender de um consultório "ativo" global.

**Combinado com o usuário:** um filtro por consultório (via botão "Filtrar" em cada tela) fica para depois — não implementado ainda.

## Correção aplicada (2026-07-29): template de e-mail de recuperação de senha

O bug encontrado antes (`{{ .ConfirmationURL }}LoginRedefinirSenha` — texto grudado na URL sem separador) foi corrigido via Management API do Supabase. Template agora só usa `{{ .ConfirmationURL }}` puro. SMTP próprio (Resend/Postmark) ainda **não configurado** — continua no mailer de teste do Supabase (2 e-mails/hora).

## Configuração global de permissões (2026-07-29)

A pedido do usuário, `permissions.defaultMode` setado como `"acceptEdits"` em `~/.claude/settings.json` (global, todas as sessões/projetos) — mudanças de arquivo não pedem mais confirmação individual. Nota: essa máquina tem outras sessões/projetos ativos (FacilitadorSped, CF Importar Nasajon) compartilhando esse mesmo arquivo global; uma primeira tentativa de gravação foi sobrescrita por uma corrida entre sessões, a segunda tentativa vingou.

## Próximos passos

1. **Testar manualmente cada tela** das Fases 2-5 (lista acima) — é o item mais importante antes de considerar o app pronto.
2. Construir o workflow n8n do agente de WhatsApp (nada disso foi começado — só a base de dados/RPCs existe).
3. Logotipo: existe um placeholder simples (`web/public/logo.svg`) — avaliar se o usuário quer evoluir pra algo mais elaborado (designer ou ferramenta de imagem).
4. Configurar SMTP próprio (Resend/Postmark etc.) antes de produção — mailer de teste do Supabase tem limite de 2 e-mails/hora.
