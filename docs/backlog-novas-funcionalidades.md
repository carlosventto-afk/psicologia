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
- **Itens 6-10 (recibo vs. nota fiscal, emissão de NFS-e, TXT do Carnê-Leão)
  formam uma cadeia**: item 6 (campo "Documento") é pré-requisito de todos os
  outros; item 8 (gerar TXT) é pré-requisito dos itens 9 (envio automático) e
  10 (marcar como já gerado). Item 7 (emitir NFS-e) só depende do 6 e pode
  ser feito em paralelo com 8/9/10. Sugestão de ordem: 6 → 7 e 8 em paralelo
  → 9 e 10 depois de 8.

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

**Status: implementado** (2026-08-04) — wizard em `/pacientes/importar`
(upload `.xlsx`/`.csv`, mapeamento de colunas, prévia, confirmação),
planilha modelo pra download, deduplicação por nome e relatório de
linhas puladas/avisos, com opção de cancelar antes de confirmar e
desfazer a leva inteira depois. Detalhes:
`docs/superpowers/specs/2026-08-04-importar-pacientes-planilha-design.md`.
Biblioteca de parse escolhida: `xlsx` (SheetJS), instalada a partir da
CDN oficial deles (não do registro npm, que está travado numa versão com
vulnerabilidades já corrigidas).

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

---

## 6. Diferenciar Recibo de Nota Fiscal no cadastro do paciente

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** hoje `Paciente.precisa_recibo` é um boolean (sim/não). Nem todo
paciente que precisa de documento fiscal quer o mesmo tipo — alguns preferem
recibo (Receita Saúde), outros exigem Nota Fiscal (NFS-e). Esse item troca o
boolean por uma escolha de tipo.

**Escopo provável:**
- Trocar `precisa_recibo` (boolean) por um campo `documento` (texto/enum) com
  2 opções: **Receita Saúde** (o recibo de hoje) e **Nota Fiscal**.
- Migration: adicionar a nova coluna, migrar os valores existentes
  (`precisa_recibo = true` → `documento = 'recibo'`; `false` → `documento =
  null`/"nenhum"), decidir se remove a coluna antiga ou mantém por um tempo.
- Renomear a tela/ação "Emitir recibo" pra algo mais genérico tipo "Emitir
  documento", ajustando o rótulo conforme o tipo escolhido no cadastro.
- `/recibos` passa a filtrar por `documento = 'recibo'` em vez de
  `precisa_recibo = true` — mesma lógica, campo diferente.

**Decisões em aberto:** nome exato do campo/valores no banco (`documento` +
`'recibo'`/`'nota_fiscal'`, ou uma tabela de tipos); se pacientes com
`documento = 'nota_fiscal'` aparecem em alguma tela separada de "Notas a
emitir" já nesta entrega ou só depois que o item 7 existir.

**Pré-requisito dos itens 7, 8, 9 e 10** — todos dependem de existir essa
diferenciação primeiro.

**Tamanho estimado:** P — troca mecânica de um boolean por um campo de
2 opções, mesmo padrão já usado pra `precisa_recibo` original.

---

## 7. Emitir Nota Fiscal (NFS-e) direto pelo sistema

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** pra pacientes marcados como "Nota Fiscal" (item 6), emitir a
NFS-e sem sair do sistema, e mandar automaticamente por e-mail pro paciente
assim que emitida.

**Ferramenta indicada pelo usuário:**
`C:\Users\Administrador\Desktop\Projetos\NotaFiscal\nfse-nacional-kit` — kit
Python de emissão/consulta/cancelamento no padrão **Nacional** de NFS-e
(SEFIN/gov.br), extraído de um ERP em produção (TN Costa Tecnologia). Não é
uma lib genérica de nota fiscal: só serve pra municípios que já aderiram ao
Sistema Nacional (checar em gov.br/nfse — quem não aderiu rejeita tudo). Já
inclui montagem/assinatura de XML (DPS), comunicação com a SEFIN (mTLS),
cancelamento e leitura de erro traduzida.

**Escopo provável:**
- **Ponte Python ↔ Next.js**: o kit é Python puro (sem framework web); este
  app é Next.js/Node. Precisa decidir a integração — um microserviço Python
  separado exposto por HTTP (rodando ao lado do app no mesmo VPS/EasyPanel),
  chamado via `fetch` a partir de uma Server Action, é o caminho mais direto
  sem reescrever a lógica fiscal em JS.
- **Certificado A1 (e-CNPJ) por profissional**: cada psicólogo que emite nota
  precisa do próprio certificado (`.pfx` + senha) — decidir onde/como guardar
  isso com segurança (nunca em texto plano no banco; considerar um secrets
  manager ou ao menos criptografia em repouso).
- **Inscrição Municipal** por profissional — campo novo no cadastro,
  obrigatório pra quem for emitir nota.
- **Numeração sequencial única por série** — o kit exige isso vindo de fora;
  precisa de um contador transacional no banco (nunca `max(numero) + 1` lido
  antes do commit, como o próprio README do kit avisa).
- **Ambiente**: começar testando em *homologação* (produção restrita) antes
  de liberar emissão em *produção* de verdade — nota emitida em produção é
  documento fiscal real, cancelar depois tem prazo e exige justificativa.
- Envio automático do XML/PDF (DANFSe) por e-mail pro paciente logo após a
  emissão confirmada.
- Guardar o XML autorizado (é o documento fiscal — o PDF é só representação e
  pode ser regerado, o XML não).

**Decisões em aberto:** licenciamento — o kit não declara licença aberta
("combine com ele os termos de uso e redistribuição" com o autor original,
TN Costa Tecnologia) — resolver isso antes de usar em produção; se o
microserviço Python fica no mesmo VPS (EasyPanel) ou separado; como cada
profissional sobe o próprio certificado `.pfx` com segurança pela UI.

**Depende do item 6.**

**Tamanho estimado:** G — é o item mais arriscado e com mais dependências
externas do backlog inteiro (certificado digital por usuário, adesão
municipal variável, ambiente de homologação, ponte entre duas linguagens,
numeração transacional, e uma decisão de licenciamento em aberto).

---

## 8. Gerar TXT do movimento de atendimentos (Recibo) pro Carnê-Leão

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** gerar um arquivo `.txt` com os atendimentos marcados como
"Recibo" (item 6) pra importar direto no Carnê-Leão (programa da Receita
Federal pra autônomos), evitando digitação manual.

**Escopo provável:**
- Tela/ação pra gerar o TXT num período (mês/intervalo de datas).
- Filtra só atendimentos com `documento = 'recibo'`.
- **Layout do arquivo**: o usuário vai apresentar o formato exato na hora da
  implementação — não assumir estrutura de colunas antes disso (o Carnê-Leão
  tem um layout de importação específico da Receita Federal que precisa ser
  seguido à risca).

**Decisões em aberto:** layout do TXT (a apresentar); nome/local de
download do arquivo gerado; se cobre só atendimentos "realizados" (com
pagamento confirmado) ou também os marcados sem `PagamentoSessao` ainda.

**Depende do item 6.**

**Tamanho estimado:** M — a lógica de exportação em si é simples, mas exige
seguir um layout externo à risca (Receita Federal), o que costuma revelar
detalhes só na hora de testar contra o programa real do Carnê-Leão.

---

## 9. Rotina periódica de envio automático do TXT (Carnê-Leão) por e-mail

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** automatizar o item 8 — gerar o TXT sozinho, num intervalo
configurável, e mandar pra um e-mail configurado, sem o profissional
precisar lembrar de gerar manualmente.

**Contexto importante:** este app **não tem nenhum scheduler/cron de
verdade hoje**. O único mecanismo parecido é o "cron preguiçoso" de
recorrências (`web/lib/recorrencia.js`), que só roda quando alguém abre a
Agenda/Painel — não serve pra isso, porque precisa disparar mesmo sem
ninguém logado. Precisa de infraestrutura nova: um cron de verdade (ex:
`node-cron` rodando junto do processo Next.js, um serviço separado, ou um
workflow no n8n — já cogitado antes pro agente de WhatsApp, mas ainda não
implantado).

**Escopo provável:**
- Configuração por profissional: frequência (semanal/quinzenal/mensal) e
  e-mail de destino.
- Job periódico que gera o TXT do item 8 e envia por e-mail (reaproveitando
  o SMTP/Resend já configurado pro Auth, ou um remetente próprio).
- Registrar quando cada envio automático rodou (auditoria básica — pra saber
  se um envio falhou).

**Decisões em aberto:** onde roda o scheduler (dentro do próprio app Next.js
via `node-cron`, ou n8n/serviço externo); o que fazer se o e-mail falhar
(retry? avisar o profissional dentro do app?).

**Depende do item 8.**

**Tamanho estimado:** M — a geração do TXT já existe (item 8); a parte nova
é só infraestrutura de agendamento, que este projeto ainda não tem em
nenhum lugar.

---

## 10. Marcar atendimento como "já gerado" em TXT

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** evitar gerar o mesmo atendimento duas vezes num TXT do
Carnê-Leão (item 8/9) — nem manualmente por engano, nem automaticamente na
rotina periódica (item 9).

**Escopo provável:**
- Novo campo na tabela de atendimento/lançamento (ex: `gerado_em_txt`,
  timestamp ou boolean) marcado no momento em que o atendimento entra num
  TXT gerado (manual ou automático).
- Geração manual (item 8): se o operador tentar incluir um atendimento já
  marcado, avisar antes de gerar (não bloquear silenciosamente — deixar o
  profissional decidir se quer incluir de novo mesmo assim).
- Geração automática (item 9): nunca incluir atendimentos já marcados, sem
  perguntar (é o próprio propósito da automação).

**Decisões em aberto:** qual tabela recebe o campo (sessão? lançamento
financeiro? os dois, já que "atendimento" pode significar coisas diferentes
dependendo do fluxo); se dá pra "desmarcar" um atendimento gerado por engano.

**Depende dos itens 8 e 9.**

**Tamanho estimado:** P — um campo novo + um filtro a mais nas duas
gerações (manual e automática).

---

## 11. Planos do produto (Psi Gestão / Psi Gestão + Marketing / Psi Marketing)

**Status: a realizar** — pedido do usuário em 2026-08-13.

**Objetivo:** o produto passa a ter 3 planos iniciais, diferenciando acesso
ao sistema de gestão (agenda, financeiro, pacientes etc.) e à divulgação no
marketplace (diretório público, item 2):

- **A) Psi Gestão** — acesso ao sistema de gestão. Sem divulgação no
  diretório público.
- **B) Psi Gestão + Marketing** — os dois: sistema de gestão completo e
  perfil divulgado no diretório público (`busca.psiagente.com.br`).
- **C) Psi Marketing** — só divulgação no diretório público, sem acesso ao
  sistema de gestão.

**Contexto importante:** hoje não existe conceito de plano — todo usuário
aprovado (`Usuarios.aprovado = true`) tem acesso total ao sistema de gestão
(`app/(app)/*`), e a visibilidade no diretório é controlada à parte por
`PerfilPublico.visivel_diretorio`, sem nenhuma trava ligada a plano ou
pagamento. O plano C (Psi Marketing) introduz um tipo de usuário novo: quem
tem perfil público mas **não** deveria conseguir abrir agenda/financeiro/
pacientes — isso hoje não é bloqueado em lugar nenhum.

**Escopo provável:**
- Campo novo em `Usuarios` (ex.: `plano`: `'gestao' | 'gestao_marketing' |
  'marketing'`).
- Gate de acesso ao grupo de rotas `app/(app)` (hoje só verifica
  login+aprovado em `proxy.js`/`app/(app)/layout.js`) — usuário no plano
  **C** não deveria conseguir abrir Agenda/Financeiro/Pacientes/Recibos,
  só a área de perfil público/diretório.
- Gate de elegibilidade pro diretório público (item 2): só planos **B** e
  **C** podem ter `visivel_diretorio = true` — plano **A** não aparece na
  busca mesmo que preencha o perfil.
- Tela/fluxo pra escolher o plano no cadastro (ou depois, numa área de
  configurações/assinatura).
- Alguma cobrança recorrente por trás disso — **não foi definido ainda** (ver
  decisões em aberto).

**Decisões em aberto (grandes, precisam de brainstorm próprio antes de
qualquer código):**
- **Preço de cada plano** — não foi informado.
- **Gateway/processador de pagamento** — este sistema hoje não processa
  nenhum pagamento de assinatura (só registra pagamentos de sessão dos
  pacientes do profissional, que é outra coisa). Precisa escolher um
  provedor (Stripe, Mercado Pago, etc.) e desenhar o fluxo de
  cobrança/renovação/inadimplência de assinatura.
- **O que acontece com os usuários já cadastrados hoje** — todos entram como
  plano B (gestão + marketing, mantendo o comportamento atual) por padrão?
  Viram um "plano legado" sem cobrança?
- **O que acontece se o pagamento falhar/atrasar** — o acesso é cortado na
  hora, dá um prazo de carência, ou só limita algumas funções?
- **Trocas de plano** — profissional pode fazer upgrade/downgrade quando
  quiser, ou só na renovação?

**Depende do item 2 (diretório público)**, já em produção — este item
reaproveita `visivel_diretorio`, só adiciona uma trava de plano em cima
dela. Não depende dos itens 6-10 (recibo/nota fiscal), são frentes
independentes.

**Tamanho estimado:** G — não é só um campo de plano: envolve gateway de
pagamento (integração nova, ainda inexistente no projeto), um tipo de
usuário com acesso parcial que hoje não existe, e várias decisões de
negócio (preço, inadimplência, migração dos usuários atuais) que precisam
ser fechadas antes de desenhar a implementação.

---

## 12. Segmento "Anamnese" no cadastro do paciente

**Status: implementado** (2026-08-15) — tabela `Anamnese` (1:1 com
`Paciente`) + `AnamneseFollowup` (histórico append-only por followup, só com
os campos alterados naquele salvamento + observação livre), nova aba
"Anamnese" em `/pacientes/[id]`, tela de edição em
`/pacientes/[id]/anamnese/editar`. Detalhes:
`docs/superpowers/specs/2026-08-15-anamnese-paciente-design.md`.

**Objetivo:** hoje o cadastro do paciente (`Paciente`, telas
`/pacientes/novo`, `/pacientes/[id]`, `/pacientes/[id]/editar`) só tem dados
cadastrais/financeiros (contato, CPF/RG, valor da sessão, responsável
financeiro). Não existe nenhum campo clínico. Este item adiciona um novo
segmento "Anamnese" dedicado a registrar dados clínicos relevantes pra
prática da psicologia — hoje o profissional não tem onde guardar isso
dentro do sistema.

**Escopo entregue:**
- Nova aba "Anamnese" em `/pacientes/[id]` (junto de "Dados" e "Sessões"),
  separada do bloco de dados cadastrais atual, com tela de edição dedicada
  em `/pacientes/[id]/anamnese/editar`.
- 11 campos finais, todos opcionais e texto livre (`web/lib/anamnese-campos.js`):
  medicação em uso, médico responsável, desde quando faz terapia, desde
  quando é atendido por este profissional, queixa inicial, desenvolvimento
  da queixa, histórico familiar relevante, tratamento
  psicológico/psiquiátrico anterior, uso de substâncias, hipótese
  diagnóstica/comorbidades, expectativas com o processo terapêutico.
- Modelo de dados: tabela `Anamnese` (1:1 com `Paciente`, criada só no
  primeiro salvamento) + `AnamneseFollowup` (histórico append-only,
  versionamento por followup — cada evento guarda só os campos que mudaram
  naquele salvamento + observação livre, não uma cópia completa do estado).
- RLS seguindo o mesmo padrão já usado em `Paciente`/`PagamentoSessao`
  (acesso escopado ao `owner`/psicólogo responsável via join em cadeia).

**Tamanho estimado:** M — campo novo de UI + tabela nova (modelo 1:1) e RLS
correspondente; não mexeu em nenhuma feature existente (financeiro, agenda,
diretório), foi aditivo ao cadastro do paciente.

---

## 13. Agente de WhatsApp — secretário do profissional

**Status: a realizar** — pedido do usuário em 2026-08-17, retomando um
projeto já iniciado antes deste backlog numerado existir. Arquitetura
completa (todas as fases) em
`C:\Users\Administrador\.claude\plans\preciso-criar-um-ecossistema-tidy-bachman.md`;
histórico técnico do que já foi feito em `docs/status-implementacao.md`,
seção "Agente de WhatsApp — Fase A em andamento".

**Objetivo:** um agente programado desde o início do produto — o
profissional fala com a ferramenta pelo próprio WhatsApp (vinculado em
`/configuracoes/whatsapp`) e consegue, por conversa: mudar data de um
atendimento, criar atendimento, consultar financeiro, consultar dados de
paciente, entre outras ações administrativas do dia a dia — sem precisar
abrir o app.

**Já existe (schema/infra aplicados em produção):**
- 11 tools + 1 helper como RPC `security definer`, exclusivas de
  `service_role` (migration `20260727000002_create_agent_rpc_functions.sql`):
  `agent_listar_consultorios`, `agent_buscar_paciente`, `agent_get_agenda`,
  `agent_status_pagamento_paciente`, `agent_listar_debitos_paciente`,
  `agent_registrar_pagamento_sessao`, `agent_marcar_atendimento_realizado`,
  `agent_agendar_sessao_avulsa`, `agent_cancelar_sessao`,
  `agent_gerar_recibo`, `agent_listar_inadimplentes`,
  `agent_resumo_financeiro`.
- Tabelas de suporte (`agent_sessions`, `agent_audit_log`,
  `lembretes_enviados`, `whatsapp_verificacao_codigos`) + RLS/grants
  fechados (migrations 000001/000003/000004).
- Tela `/configuracoes/whatsapp` (`VincularWhatsappForm.js`) — profissional
  gera código de 6 dígitos e vincula o próprio número.
- Canal: **Evolution API** self-hosted (não WhatsApp Cloud API oficial),
  rodando no EasyPanel da mesma VPS, já pareado com um número dedicado —
  decisão tomada cientemente do risco de banimento por violar os Termos de
  Serviço do WhatsApp (ver `docs/status-implementacao.md` pro incidente já
  registrado de queda/reconexão). Efeito prático: se o número cair, todo
  profissional fica sem o agente ao mesmo tempo, não só um.

**Falta pra existir de verdade (nada disso foi começado ainda):**
- O workflow n8n em si — `WA - Inbound Router` + `WA - Agent Psicólogo` —
  que liga a mensagem recebida no WhatsApp a um LLM (Claude) com acesso às
  RPC tools acima. Hoje só a base de dados está pronta pra receber esse
  trabalho.
- Transcrição de áudio (Whisper), já que mensagem de voz é um canal comum
  no WhatsApp.
- Wrapper de log em `agent_audit_log` (toda ação do agente registrada, pra
  auditoria/depuração).
- **Gap identificado agora:** a lista de tools de hoje cobre criar
  (`agent_agendar_sessao_avulsa`) e cancelar (`agent_cancelar_sessao`) uma
  sessão, mas não **reagendar/mudar a data de uma sessão existente** — que
  é explicitamente um dos comandos pedidos ("mudar data de atendimento").
  Precisa de uma RPC nova (ex: `agent_reagendar_sessao`) ou decidir que
  reagendar = cancelar + criar de novo (mais simples, mas perde o vínculo
  com a sessão original e qualquer coisa já registrada nela).
- Os 3 textos de mensagem já redigidos (`docs/whatsapp-message-templates.md`)
  não precisam mais de aprovação de template (isso só existe na API oficial
  da Meta) — com Evolution API são só texto livre, mas vale revisar se
  ainda refletem o fluxo atual antes de usar.

**Decisões em aberto:** confirmar com o usuário se o escopo desta entrega é
só o canal do profissional (como pedido no texto de hoje) ou se reabre
também o canal opcional do paciente já desenhado na arquitetura original
(consulta + solicitação de reagendamento/cancelamento sujeita a aprovação
do psicólogo) — são fluxos de conversa e prompts diferentes, mesmo
reaproveitando canal/infra.

**Tamanho estimado:** G — a parte estrutural (schema/RPCs/RLS/canal) já
está pronta, mas a peça que falta é a mais complexa do projeto todo: o
próprio agente (orquestração n8n + LLM + prompt engineering + tratamento de
erro de tool call + transcrição de áudio), do zero.
