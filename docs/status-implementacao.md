# Status da implementação

Última atualização: 2026-07-30.

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

**Concluído nesta entrega (parte da Fase A — fecha o loop de vinculação):**
- Migration `20260730000001_whatsapp_agent_onboarding.sql` — RPCs
  `gerar_codigo_verificacao_whatsapp` (authenticated, chamada pelo Next.js)
  e `validar_codigo_whatsapp` (service_role, futura chamada pelo n8n).
- Tela `/configuracoes/whatsapp` (`VincularWhatsappForm.js`) — psicólogo
  gera um código de 6 dígitos válido por 10 minutos pra vincular o número.

**Ainda faltando pra Fase A estar completa:** conta Meta Business/WhatsApp
Cloud API, n8n publicado no EasyPanel, workflow `WA - Inbound Router` +
`WA - Agent Psicólogo` (com as 11 tools já existentes), transcrição de
áudio (Whisper), wrapper de log em `agent_audit_log`, submissão dos 3
templates de mensagem já redigidos (`docs/whatsapp-message-templates.md`)
pra aprovação da Meta.

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
