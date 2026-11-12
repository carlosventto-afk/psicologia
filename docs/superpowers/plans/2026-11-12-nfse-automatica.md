# NFS-e automática a partir da Cobrança recebida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao receber uma Cobrança com documento `nota_fiscal`, emitir a NFS-e sozinho (uma nota por cobrança, ou por sessão para pacientes marcados), enviar ao tomador por e-mail e WhatsApp, e mostrar a sessão como "Documentada".

**Architecture:** Um serviço de servidor `emitirNotasDaCobranca(supabase, cobrancaId)` que recebe o cliente Supabase (hoje a sessão do operador; no item 34 o cliente de serviço do webhook), reserva a numeração por RPCs que aceitam o dono explicitamente, chama o `nfse-service` já existente e entrega o resultado. O gatilho é a ação de receber cobrança; reprocessamento por endpoint com segredo chamado pelo n8n. "Documentada" é derivado, como "Cobrada".

**Tech Stack:** Next.js (server actions), Supabase Postgres (RLS/RPC), `nfse-service` (FastAPI, já existente), Resend (e-mail), Evolution API (WhatsApp, `web/lib/whatsapp.js`), n8n (agendamento).

**Spec:** `docs/superpowers/specs/2026-11-12-nfse-automatica-design.md`

## Global Constraints

- Emissão automática só para cobrança com `tipo_documento = 'nota_fiscal'` **e** `DadosFiscaisProfissional.emissao_automatica = true` (padrão `false`). Sem isso, só o botão manual.
- Tomador = responsável financeiro da cobrança (`cpf_cnpj`, `nome`, `email`, `telefone`) quando existir; senão o paciente (`cpf`, `nome`, `email`, `telefone`).
- Uma nota por cobrança com `valor = soma dos valor_aplicado` do recebimento da cobrança; quando `Cobranca.emissao_por = 'sessao'`, uma nota por `RecebimentoSessao` do recebimento (como hoje).
- Descrição exata (datas `dd/mm/aaaa`; várias separadas por `, ` e a última por ` e `):
  ```
  Atendimento(s) psicológico(s) em {datas}.

  Serviço prestado por:
  {Usuarios.nome}
  CRP: {Usuarios.crp}
  ```
- Competência por cobrança = data da **última** sessão; por sessão = data da sessão. Sempre ≤ data de emissão.
- Nunca duas notas ativas (`pendente`/`autorizada`) cobrindo a mesma sessão (nota da cobrança e nota por sessão se excluem, nas duas RPCs).
- Falha de emissão ou de entrega **nunca** altera o recebimento. Reprocessamento: no máximo **3** tentativas (`tentativas`), depois e-mail de alerta ao profissional.
- Entrega ao tomador **somente** com `DadosFiscaisProfissional.ambiente = 'producao'`. WhatsApp só se o tomador tem telefone e `Paciente.whatsapp_lembrete_opt_in = true`; senão só e-mail. Cada canal registra `enviada_*_em` e nunca reenvia.
- CRP (`Usuarios.crp`) obrigatório para ativar a emissão automática.
- "Documentada" é derivada (nota `autorizada` cobrindo a sessão), nunca um valor de `Sessao.status`.
- Textos e comentários em pt-BR; sem push; migrations só aplicadas em produção com autorização do usuário.

## Review Focus

- Duplo recebimento/duplo clique ou receber de novo após reabertura: nunca gera duas notas ativas para a mesma cobrança.
- Nota da cobrança autorizada + tentativa manual de nota por sessão da mesma cobrança (e o inverso): recusadas, nas duas RPCs.
- Emissão falha (serviço fora, rejeição) logo após receber: o recebimento permanece, a cobrança mostra o motivo, o botão "Tentar de novo" e o reprocessamento funcionam sem duplicar números.
- Ambiente `homologacao`: emite mas não envia nada ao paciente.
- Tomador sem CPF/CNPJ, profissional sem CRP, certificado vencido, dados fiscais incompletos: não emite, mostra "Nota pendente: <motivo>", sem consumir número.
- Entrega parcial (e-mail ok, WhatsApp falhou): reprocessar reenvia só o canal que falhou.
- Cobrança de vários meses / uma só sessão / sessões em dias diferentes: datas e competência corretas na descrição.

---

### Task 1: Schema e RPCs de numeração

**Files:**
- Create: `supabase/migrations/20261112000001_nfse_automatica.sql`

**Interfaces:**
- Produces (SQL):
  - `NotaFiscal`: `cobranca bigint null references "Cobranca"(id)`; check passa a exigir `num_nonnulls(pagamento_sessao, recebimento_sessao, cobranca) = 1`; índice único parcial `notafiscal_cobranca_ativa on "NotaFiscal"(cobranca) where status in ('pendente','autorizada')`; colunas `pdf_base64 text`, `enviada_email_em timestamptz`, `enviada_whatsapp_em timestamptz`, `tentativas int not null default 0`, `ultimo_erro text`, `tomador_nome text`, `tomador_documento text`.
  - `Paciente.nota_por_sessao boolean not null default false`; `Cobranca.emissao_por text not null default 'cobranca' check (emissao_por in ('cobranca','sessao'))`; `DadosFiscaisProfissional.emissao_automatica boolean not null default false`.
  - `registrar_nota_fiscal_cobranca_pendente(p_cobranca bigint, p_owner uuid default auth.uid()) returns table (id bigint, numero int, serie text, ambiente text)` e a versão atualizada de `registrar_nota_fiscal_pendente(p_recebimento_sessao bigint, p_owner uuid default auth.uid())` (mesmo retorno). Ambas: aceitam `p_owner` só se `p_owner = auth.uid()` ou o chamador é `service_role`; checam posse da cobrança/recebimento; **recusam** se existir nota ativa da outra relação cobrindo a mesma(s) sessão(ões) (`COBRANCA`-style message em pt-BR); incrementam `proximo_numero` e inserem a nota `pendente` na mesma transação.
  - `criar_cobranca` ganha `p_emissao_por text default null` (se nulo, deriva de `Paciente.nota_por_sessao`). Mudar a assinatura de função exige `drop function` da antiga + `create`, mantendo as mesmas garantias do item 32 (ler `20261107000001_add_cobrancas.sql` e `…0002`).
- Consumes: tabelas e funções do item 32.

- [ ] **Step 1:** Escrever a migration com as colunas, o check, o índice, as duas RPCs de numeração com guarda mútua e a nova assinatura de `criar_cobranca`, preservando `security invoker`, `search_path`, mensagens com prefixo `COBRANCA: ` e a ordem de lock (Cobranca antes de Sessao).
- [ ] **Step 2:** Reler o SQL duas vezes (aspas em identificadores com maiúsculas, nomes de coluna contra as migrations existentes) — não há como executar sem aplicar.
- [ ] **Step 3:** Commit `feat: schema e numeracao para NFS-e por cobranca` (não aplicada).

### Task 2: Funções puras (descrição, datas, tomador, elegibilidade)

**Files:**
- Create: `web/lib/nota-fiscal.js`, `web/lib/nota-fiscal.test.mjs`

**Interfaces:**
- Produces:
  - `formatarListaDatas(datasISO: string[]): string` — `["2026-05-13"]`→`"13/05/2026"`; duas → `"13/05/2026 e 20/05/2026"`; três+ → `"13/05/2026, 20/05/2026 e 27/05/2026"`; ordena e remove duplicadas.
  - `montarDescricaoNota({ datasISO: string[], nomeProfissional: string, crp: string }): string` — exatamente o modelo das Global Constraints (linha em branco entre os blocos, sem espaço sobrando).
  - `competenciaDaNota(datasISO: string[]): string` — a maior data (`YYYY-MM-DD`).
  - `escolherTomador({ responsavel, paciente }): { nome, documento, email, telefone, origem: "responsavel"|"paciente" }` — responsável quando existe; senão paciente; `documento` só dígitos; erro tipado (`{ erro: "sem_documento" }`) quando o escolhido não tem CPF/CNPJ.
  - `validarPreCondicoes({ fiscal, usuario, tomador, hoje }): { ok: true } | { ok: false, motivo: string }` — dados fiscais ausentes, certificado ausente/vencido, CRP ausente, tomador sem documento.
  - `canaisDeEntrega({ ambiente, tomador, optInWhatsapp, jaEnviadoEmail, jaEnviadoWhatsapp }): { email: boolean, whatsapp: boolean }`.

- [ ] **Step 1:** Escrever os testes (`node:test`): a descrição de uma e de três datas (string exata com `\n`), ordenação/duplicatas, competência, tomador com e sem responsável, sem documento, cada motivo de pré-condição, e `canaisDeEntrega` em homologação (tudo `false`), produção sem opt-in (só e-mail), produção com opt-in (ambos), canal já enviado (`false`).
- [ ] **Step 2:** Rodar `cd web && node --test lib/nota-fiscal.test.mjs` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `web/lib/nota-fiscal.js` (ESM puro; `web/lib/package.json` já declara `type: module`).
- [ ] **Step 4:** Rodar o teste — Expected: PASS, saída sem avisos.
- [ ] **Step 5:** Commit `feat: regras puras da NFS-e por cobranca`.

### Task 3: Serviço de emissão

**Files:**
- Create: `web/lib/nfse-emissao.js`
- Modify: `web/lib/data/cobrancas.js` (consulta de apoio, se necessária)

**Interfaces:**
- Consumes: Tasks 1-2; `chamarServicoNfse` (`web/lib/nfse-client.js`); padrão de payload de `web/lib/actions/notas-fiscais.js` (`emitirNotaFiscal`), que **não** deve ser alterado.
- Produces: `emitirNotasDaCobranca(supabase, cobrancaId: number, { manual?: boolean }): Promise<{ notas: { id: number, status: "autorizada"|"rejeitada"|"pendente", erro?: string }[], pendencia?: string }>`. Carrega cobrança, recebimento, sessões, paciente, responsável e dados fiscais com o `supabase` recebido (RLS vale); exige cobrança `recebida` com `tipo_documento = 'nota_fiscal'`; aplica `validarPreCondicoes` (se falhar, devolve `pendencia` e **não** reserva número); reserva número pela RPC correspondente; monta o payload (`tomador`, `descricao_servico`, `competencia`, `valor`) e chama `/emitir`; persiste `dps_id`, `xml_dps`, `status`, `chave_acesso`, `xml_nfse`, `pdf_base64`, `erros`, `tomador_nome`, `tomador_documento` (mesmo formato de gravação de hoje); incrementa `tentativas` e guarda `ultimo_erro` em falha. Idempotente: se já existe nota ativa para a cobrança (ou para as sessões, no modo por sessão), devolve a existente sem emitir de novo.

- [ ] **Step 1:** Implementar o serviço seguindo exatamente o fluxo de `emitirNotaFiscal` para chamada e persistência, trocando a origem dos dados e usando as funções puras da Task 2.
- [ ] **Step 2:** Garantir que um erro da chamada ao serviço marca a nota `rejeitada` com `ultimo_erro` (como a action atual faz) e que nenhuma exceção sobe ao chamador: o resultado é sempre o objeto descrito.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro (no worktree com `node_modules` em junction, usar `--webpack`).
- [ ] **Step 4:** Commit `feat: servico de emissao de NFS-e por cobranca`.

### Task 4: Entrega ao tomador (e-mail e WhatsApp)

**Files:**
- Modify: `web/lib/whatsapp.js`, `web/lib/email.js` (somente se precisar parametrizar texto)
- Create: `web/lib/nfse-entrega.js`

**Interfaces:**
- Consumes: `canaisDeEntrega` (Task 2); `enviarEmailNotaFiscal` (já existe); `sendText` pattern de `web/lib/whatsapp.js` (`EVOLUTION_API_KEY`).
- Produces:
  - `enviarDocumentoWhatsApp({ numero: string, base64: string, nomeArquivo: string, legenda: string }): Promise<{ error: Error | null }>` (Evolution `message/sendMedia/{instance}`, `mediatype: "document"`), no estilo de retorno de `web/lib/whatsapp.js`.
  - `entregarNota(supabase, notaId: number): Promise<{ email: "enviado"|"pulado"|"falhou", whatsapp: "enviado"|"pulado"|"falhou" }>` — usa `NotaFiscal` autorizada, o ambiente fiscal e o tomador gravado; envia só os canais permitidos por `canaisDeEntrega`; grava `enviada_email_em` / `enviada_whatsapp_em` por canal; falha em um canal não impede o outro e grava `ultimo_erro`; sem PDF, o WhatsApp vai como texto com a chave de acesso (`sendText`). A legenda/mensagem abre identificando a psicóloga ("Nota fiscal do atendimento com {nome}...").

- [ ] **Step 1:** Implementar `enviarDocumentoWhatsApp` espelhando `sendText` (normalização do número como o arquivo já faz).
- [ ] **Step 2:** Implementar `entregarNota` com idempotência por canal.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: entrega da NFS-e por e-mail e WhatsApp`.

### Task 5: Gatilho no recebimento, botão manual e selo "Documentada"

**Files:**
- Modify: `web/lib/actions/cobrancas.js` (`receberCobranca`), `web/app/(app)/(gestao)/cobrancas/[id]/page.js`, `web/lib/data/pacientes.js` (`listarSessoesDoPaciente`), `web/app/(app)/(gestao)/pacientes/[id]/page.js`, `web/lib/data/cobrancas.js`
- Create: `web/components/EmitirNotaCobrancaBotao.js`, `web/components/NotaCobrancaStatus.js`

**Interfaces:**
- Consumes: `emitirNotasDaCobranca`, `entregarNota` (Tasks 3-4).
- Produces:
  - em `receberCobranca`, depois do sucesso do recebimento: se `tipo_documento = 'nota_fiscal'` e `emissao_automatica`, chamar `emitirNotasDaCobranca` e, para cada nota autorizada, `entregarNota`, dentro de `try/catch` que **nunca** muda o retorno do recebimento;
  - ação `emitirNotaDaCobranca(cobrancaId): Promise<{ ok } | { error }>` (para o botão "Emitir nota" / "Tentar de novo": emite e entrega), sem `throw` em falha esperada;
  - `NotaCobrancaStatus({ notas, pendencia })`: mostra pendente/autorizada (chave e link)/rejeitada (motivo) no detalhe;
  - `listarSessoesDoPaciente` devolve `documentada: boolean` (nota `autorizada` da cobrança do recebimento da sessão, ou nota por sessão da própria `RecebimentoSessao`); selo "Documentada" na aba "Sessões" e no detalhe da cobrança.

- [ ] **Step 1:** Implementar o gatilho e a ação manual; erros devolvidos como `{ error }` (nunca lançados) por causa do Next em produção.
- [ ] **Step 2:** Implementar a consulta de "Documentada" e os dois componentes de UI.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: emissao automatica ao receber cobranca e selo documentada`.

### Task 6: Flags e configurações na interface

**Files:**
- Modify: `web/components/PacienteForm.js`, `web/lib/actions/pacientes.js`, `web/lib/actions/cobrancas.js` (`criarCobranca`, `criarCobrancasDoMes`), `web/components/AgruparSessoesForm.js`, `web/components/NovaCobrancaMesForm.js`, `web/app/(app)/(gestao)/configuracoes/nfse/page.js`, `web/lib/actions/dados-fiscais.js`

**Interfaces:**
- Consumes: colunas e assinatura nova de `criar_cobranca` (Task 1).
- Produces: checkbox "Emitir nota por sessão" no cadastro do paciente (`nota_por_sessao`) e exposição do opt-in de WhatsApp (`whatsapp_lembrete_opt_in`) se ainda não estiver no formulário; seletor "Uma nota por cobrança / por sessão" nas duas telas de criar cobrança (pré-selecionado pela flag do paciente) enviando `emissao_por`, repassado ao RPC; interruptor "Emitir NFS-e automaticamente ao receber" em `/configuracoes/nfse`, que recusa ativar sem CRP em `Usuarios.crp` e mostra o porquê.

- [ ] **Step 1:** Implementar os campos e a passagem de `emissao_por` até o RPC.
- [ ] **Step 2:** Implementar o interruptor com a validação do CRP.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: flags de nota por sessao, opt-in e emissao automatica`.

### Task 7: Reprocessamento

**Files:**
- Create: `web/app/api/notas-fiscais/reprocessar/route.js`, `scripts/n8n-nfse-reprocessar/01-workflow.mjs`
- Modify: `web/lib/supabase/proxy.js` (rota pública), `web/lib/nota-fiscal.js` (+ testes) se precisar de seleção pura

**Interfaces:**
- Consumes: `emitirNotasDaCobranca`, `entregarNota`; segredo `NFSE_REPROCESS_CRON_SECRET` (header `x-cron-secret`, 401 sem ele), cliente de serviço (`createAdminClient`).
- Produces: `POST /api/notas-fiscais/reprocessar` → `{ reemitidas: number, entregues: number, esgotadas: number }`: seleciona notas `rejeitada` por falha transitória e notas `autorizada` com canal permitido não enviado, com `tentativas < 3`; processa em lote limitado; ao atingir 3 tentativas envia e-mail de alerta ao profissional (`enviarEmailResend`) uma única vez e para; idempotente. O script cria o workflow n8n diário no padrão de `scripts/n8n-agente-whatsapp/lib.mjs` (exige `N8N_API_KEY` ao executar; **não executar** sem o usuário).

- [ ] **Step 1:** Implementar a seleção pura (que notas reprocessar) com testes, depois a rota usando-a.
- [ ] **Step 2:** Implementar o script do workflow n8n (sem executá-lo) e adicionar a rota às públicas do proxy.
- [ ] **Step 3:** `cd web && npx next build` — Expected: sem erro.
- [ ] **Step 4:** Commit `feat: reprocessamento de NFS-e e entregas`.

### Task 8: Verificação ponta a ponta e backlog

**Files:**
- Modify: `docs/backlog.md` (item 33 em "Implementado" com o que foi/não foi verificado)

- [ ] **Step 1:** Com autorização do usuário, aplicar a migration em produção (script `pg` já usado nos itens 22/32, com `lock_timeout`, tentando direto e caindo para o pooler; `notify pgrst, 'reload schema'`). Ordem: migration antes do deploy do app.
- [ ] **Step 2:** Com usuário, paciente e responsável descartáveis (apagados ao final), contra **homologação** (`DadosFiscaisProfissional.ambiente = 'homologacao'`, certificado válido de teste): cobrança por cobrança e por sessão, receber, conferir nota(s), descrição, valor, tomador (responsável e paciente), "Documentada", que nada foi enviado ao paciente em homologação, idempotência de duplo recebimento, guarda mútua cobrança×sessão, falha forçada + reprocessamento sem duplicar número.
- [ ] **Step 3:** Atualizar `docs/backlog.md` e commit `docs: item 33 implementado`.
- [ ] **Step 4:** Pedir ao usuário autorização para push/deploy.

### Task 9: Gate de produção (depende do usuário)

Não é código; bloqueia só a **ativação em produção** (o interruptor de emissão automática nasce desligado).

- [ ] **Step 1:** Com o certificado do próprio prestador (e-CNPJ), emitir **uma nota de teste em homologação** e confirmar que a SEFIN a autoriza (resolve o erro E0718 do item 7).
- [ ] **Step 2:** Trocar o perfil fiscal para produção (irreversível, como já protegido) e emitir uma nota real de baixo risco; só depois ligar `emissao_automatica`.
