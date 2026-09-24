# Extrator de leads dos diretórios Doctoralia e Nossos Psicólogos (RJ)

**Status:** aprovado, pronto para plano de implementação.

## Objetivo

Gerar e manter atualizada, dentro do Supabase do PsiAgente, uma base de
psicólogos com presença pública nos diretórios **Doctoralia** e
**Nossos Psicólogos**, restrita ao Rio de Janeiro — nome, especialidade,
cidade, URL do perfil de origem. Essa base serve como universo de
prospecção adicional pro time comercial do PsiAgente, complementando o
`leads_cfp` já existente (spec `2026-09-01-scraper-leads-cfp-rj-design.md`):
psicólogo já presente num diretório concorrente é sinal de que já investe
em captação de pacientes — lead potencialmente mais qualificado.

Execução recorrente (mínimo mensal) para capturar novos cadastros.

## Não são objetivos desta entrega

- **Dado de contato** (e-mail, telefone, WhatsApp, nº de CRP). Nenhum dos
  dois sites expõe isso na página pública de perfil — fica atrás do fluxo
  de agendamento/chat deles (confirmado por inspeção manual de perfis
  reais de ambos os sites). Mesma limitação já documentada no `leads_cfp`.
- **Cruzamento/matching com `leads_cfp` por nome.** Esta entrega só
  popula `leads_diretorio`; o cruzamento das duas bases é uma etapa
  seguinte, fora de escopo aqui.
- **Cobertura nacional.** Escopo é Rio de Janeiro nesta entrega, para
  espelhar o foco comercial atual. Expandir geografia é extensão futura
  (trivial no Doctoralia, que já filtra por cidade na URL; exige refiltrar
  dados já coletados no Nossos Psicólogos, que não tem cidade na URL).
- **Qualquer forma de burlar proteção anti-bot** (captcha, autenticação
  necessária, rate-limit) — se um dos dois sites escalar proteção, o
  scraper daquela fonte para e loga; não há resolução automática.
- **Avaliações, fotos, preços ou qualquer outro dado de perfil** além de
  nome/especialidade/cidade.

## Descoberta técnica (investigação feita)

### Doctoralia (`www.doctoralia.com.br`)

- `robots.txt`: permite geral (`Allow: /`); bloqueia apenas `/pesquisa?`
  (página de busca/listagem), `/api/`, `/ajax/` e alguns paths
  administrativos. **Perfis individuais não são bloqueados.**
- Tem `sitemap.xml` (índice) apontando para `sitemap.doctor_0.xml` a
  `sitemap.doctor_9.xml`, cada um com dezenas de milhares de URLs de
  profissionais de todas as especialidades, formato
  `https://www.doctoralia.com.br/{nome-slug}/{especialidade-slug}/{cidade-slug}`.
  Confirmado por download real: existem entradas como
  `/sara-alves-2/psicologo/belo-horizonte`. Filtrar por `/psicologo/` no
  path isola psicólogos; filtrar por cidade-slug (lista de municípios do
  RJ) isola a região sem precisar abrir a página.
- Perfil individual é **HTML server-rendered** (~200KB), parseável com
  cheerio, sem necessidade de browser. Testado em perfil real: expõe
  nome (`"name":"Sara Alves"`) e especialidade/cidade (via breadcrumb e
  URL); **não expõe** telefone, e-mail, WhatsApp nem CRP — só strings de
  i18n como `WHATSAPP_PROFILE_BUTTON` (rótulo de botão, não dado).
- Não há sitemap de "psicólogo por estado" pronto — a filtragem por
  RJ é feita client-side (no scraper) sobre a lista de URLs, comparando o
  segmento de cidade contra uma lista fixa de municípios do RJ.

### Nossos Psicólogos (`nossospsicologos.com.br`)

- `robots.txt`: permite geral (`Allow: /`), com poucas exceções
  específicas (perfis individuais isolados, não relevantes aqui). Lista
  `Sitemap: https://nossospsicologos.com.br/sitemap.xml` explicitamente.
- `sitemap.xml` lista URLs `/profissional/{slug}` (com duplicatas —
  scraper precisa deduplicar). **Não tem cidade na URL.**
- O site é uma **SPA Angular** (`<nd-root>`, HTML cru de ~4.5KB sem
  conteúdo) — não dá pra extrair dado nenhum sem executar JS ou chamar a
  API que o front consome.
- API identificada no bundle JS (`main-es2015.*.js`): base
  `https://api.nossospsicologos.com.br/v1/`, com chamada
  `GET professional/{slug-ou-id}` (encontrado como
  `this.http.get(\`professional/${t}\`)` no código-fonte minificado).
  **Testado ao vivo:** `GET /v1/professional/{slug}` com headers de
  browser (User-Agent, Accept, Referer, Origin) retorna `404 {"message":""}`
  — a API responde (CORS headers presentes, confirma que é o endpoint
  certo), mas rejeita a chamada. Causa não identificada ainda: pode ser
  parâmetro incorreto (slug vs. id numérico interno), header/token
  adicional não capturado na análise estática do bundle, ou exigência de
  sessão anônima estabelecida via outra chamada antes.
- **Decisão de implementação:** o primeiro passo do plano é investigar a
  chamada de rede real (via chrome-devtools, abrindo um perfil de
  verdade e inspecionando a requisição feita pelo próprio app) para
  descobrir a forma correta de chamar a API sem browser. Se não for
  replicável de forma limpa (ex.: exige token de sessão renovado a cada
  carga), o crawler cai para **Playwright** (mesmo padrão usado no
  `cfp-leads-service` para o CFP), navegando e lendo o DOM renderizado
  em vez de chamar a API diretamente.

## Arquitetura

Novo serviço de longa duração, seguindo o mesmo padrão do
`cfp-leads-service/` e `nfse-service/` existentes (pasta própria na raiz,
Dockerfile próprio, deploy como app separado no EasyPanel/VPS):

```
diretorio-leads-service/
  package.json          # Node.js (CommonJS) + cheerio + (playwright, se necessário)
  Dockerfile             # imagem base depende da decisão Playwright (ver acima)
  src/
    sources/
      doctoralia.js        # descoberta via sitemap + fetch/cheerio por perfil
      nossosPsicologos.js  # descoberta via sitemap + fetch-API ou Playwright
    supabase.js           # cliente Supabase (upsert leads_diretorio, ler/gravar state)
    scheduler.js           # loop principal: roda 1 lote por fonte, dorme até o próximo horário
    index.js                 # entrypoint
```

Cada fonte roda como um lote independente dentro do mesmo agendamento
(não bloqueia uma a outra se uma falhar). Ambas escrevem na mesma tabela
`leads_diretorio`, diferenciadas por `fonte`.

## Algoritmo de varredura

### Doctoralia

1. Ao acordar, lê `cursor` de `leads_diretorio_scan_state` para
   `fonte = 'doctoralia'` (posição no índice de sitemaps + offset).
2. Baixa (ou reusa cache local do lote) os `sitemap.doctor_N.xml`
   pendentes, filtra URLs com `/psicologo/` e cidade-slug pertencente à
   lista de municípios do RJ.
3. Para cada URL nova (ainda não em `leads_diretorio`): GET simples +
   parse cheerio, extrai nome/especialidade/cidade, `upsert`.
4. Delay aleatório de 1–2s entre requisições. Erro de rede: até 3
   retentativas com backoff; falha persistente não trava o lote inteiro
   (pula a URL, loga, segue).
5. Ao fim do lote (tamanho fixo por execução), grava `cursor` e
   `last_run_at`.

### Nossos Psicólogos

1. Ao acordar, lê `cursor` de `leads_diretorio_scan_state` para
   `fonte = 'nossos_psicologos'` (offset na lista de slugs do sitemap).
2. Baixa `sitemap.xml`, extrai e deduplica todas as URLs
   `/profissional/{slug}`.
3. Para cada slug novo: obtém nome/especialidade/cidade via API (se
   viável) ou via Playwright (fallback). Filtra por cidade do RJ **depois**
   de obter o dado (não dá pra pré-filtrar).
4. Delay aleatório entre requisições (2,5–5s se for Playwright, igual ao
   padrão do CFP; menor se for API HTTP simples).
5. Ao fim do lote, grava `cursor` e `last_run_at`.

## Modelo de dados (Supabase)

```sql
create table leads_diretorio (
  fonte text not null,              -- 'doctoralia' | 'nossos_psicologos'
  slug text not null,                -- identificador da URL na fonte
  nome text not null,
  especialidade text,
  cidade text,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (fonte, slug)
);

create table leads_diretorio_scan_state (
  fonte text primary key,
  cursor text,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
```

Consumo (fora de escopo desta entrega, mas é o uso pretendido):
`select * from leads_diretorio where cidade in (<municípios RJ>)`, e
posteriormente cruzamento por nome com `leads_cfp`.

## Observabilidade

Sem dashboard dedicado. Verificação por consulta direta ao Supabase:
`cursor` e `last_run_at` em `leads_diretorio_scan_state` (por fonte)
mostram avanço; `last_error` não-nulo indica que o último lote parou e
precisa de checagem manual.

## Riscos conhecidos

- **API do Nossos Psicólogos pode não ser replicável sem browser** —
  força fallback pra Playwright, aumentando custo/tempo de execução
  (mesma ordem de grandeza do crawler do CFP). Só será confirmado na
  investigação inicial do plano de implementação.
- **Mudança de HTML/sitemap/API em qualquer um dos dois sites** quebra o
  scraper daquela fonte sem aviso — sem contrato/SLA com nenhum dos dois.
  Aceito como risco operacional, mesma postura do `cfp-leads-service`.
- **Bloqueio de IP** por padrão de tráfego, mesmo respeitando robots.txt
  e usando delay — mitigado por ritmo conservador, não garantido. Se
  ocorrer, reduzir volume/frequência é a mitigação manual (sem rotação
  de IP ou outra técnica de evasão).
- **Ambos são concorrentes diretos do PsiAgente.** Uso restrito a dado
  público, sem login, sem contornar paywall/captcha/autenticação,
  respeitando robots.txt de cada site. Risco residual de notificação de
  violação de ToS por parte deles; aceito como risco operacional, mesma
  decisão de negócio já tomada para o `leads_cfp`.

## Verificação

- Rodar um lote pequeno (ex. 50 perfis) de cada fonte manualmente antes
  de agendar o serviço definitivo, conferindo: upserts corretos em
  `leads_diretorio`, filtragem correta por cidade do RJ, avanço do
  `cursor`, e que o delay entre requisições está sendo respeitado.
- Confirmar que nenhuma URL `/pesquisa?` (Doctoralia) é acessada durante
  a execução (checar logs de requisição do lote).
- Interromper o processo no meio de um lote e reiniciar, confirmando que
  ele retoma do `cursor` salvo (idempotência/retomada), por fonte.
