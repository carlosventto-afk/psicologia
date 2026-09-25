# Extrator de leads dos diretórios Doctoralia e Nossos Psicólogos (RJ)

**Status:** aprovado, pronto para plano de implementação.

## Objetivo

Gerar e manter atualizada, dentro do Supabase do PsiAgente, uma base de
psicólogos com presença pública nos diretórios **Doctoralia** e
**Nossos Psicólogos**, restrita ao Rio de Janeiro — nome, CRP,
especialidade, cidade, telefone/WhatsApp e endereço do consultório (onde
disponível), URL do perfil de origem. Essa base serve como universo de
prospecção adicional pro time comercial do PsiAgente, complementando o
`leads_cfp` já existente (spec `2026-09-01-scraper-leads-cfp-rj-design.md`):
psicólogo já presente num diretório concorrente é sinal de que já investe
em captação de pacientes — lead potencialmente mais qualificado. Ter
telefone/WhatsApp direto viabiliza contato comercial futuro sem depender
do cruzamento com outra base.

Execução recorrente (mínimo mensal) para capturar novos cadastros.

## Não são objetivos desta entrega

- **CPF.** A API do Nossos Psicólogos expõe `professional_profile_cpf` no
  mesmo payload usado para telefone/endereço (achado na investigação
  técnica abaixo) — **deliberadamente não coletado**. CPF é o dado
  pessoal mais sensível em termos de LGPD; coletar em massa, de uma API
  que não foi feita pra consumo público, pra fins de prospecção
  comercial, é um risco desproporcional ao ganho (nome + CRP já
  identificam o profissional de forma única pra cruzamento). Decisão de
  negócio confirmada explicitamente com o usuário em 24/09/2026: telefone
  e endereço entram, CPF fica de fora. Se o campo aparecer em qualquer
  resposta da API, o parser do Nossos Psicólogos deve ignorá-lo
  explicitamente (não só "esquecer" de mapear — ver Task de parsing no
  plano de implementação).
- **E-mail.** Nenhum dos dois sites expõe e-mail do profissional na
  página nem na API de perfil (confirmado na investigação). Fica de fora
  por não existir na fonte, não por escolha.
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
- **Avaliações, fotos, preços, forma de pagamento, agenda ou qualquer
  outro dado de perfil** além de nome/CRP/especialidade/cidade/
  telefone/WhatsApp/endereço.

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
  i18n como `WHATSAPP_PROFILE_BUTTON` (rótulo de botão, não dado). Ou
  seja: leads do Doctoralia sempre terão `telefone`/`endereco` nulos —
  não é omissão do scraper, é limitação real da fonte.
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
- **Endpoint real confirmado** (via chrome-devtools, inspecionando a
  chamada de rede que o próprio app faz ao abrir um perfil real):
  `GET https://api.nossospsicologos.com.br/v1/patient/professional/{slug}`
  — path correto é `patient/professional/{slug}`, não `professional/{slug}`
  como a leitura estática do bundle JS sugeria (o `patient/` vem de um
  base URL configurado no HttpClient do Angular, não visível como string
  literal única no bundle).
  **Confirmado por HTTP puro, sem browser:** `curl` com headers
  `Accept: application/json, text/plain, */*`, `Referer:
  https://nossospsicologos.com.br/`, `Origin: https://nossospsicologos.com.br`
  e um `User-Agent` de navegador retorna `200` com o JSON completo — CORS é
  checado só pelo browser, então uma chamada server-to-server não precisa
  simular sessão nem passa por nenhum outro tipo de proteção. **Não
  precisa de Playwright** para esta fonte.
- **Campos disponíveis no JSON de resposta** (`data.message.professional`):
  `name`, `council.number` (CRP, formato `"06/26833"`), `council.state`,
  `schema.city` (slug tipo `"sao-paulo-sp"`), `schema.specialty_name`,
  `url_whats` (link `wa.me` com número e mensagem pré-preenchida),
  `clinic.telephone`, `clinic.address` (`street`, `number`, `complement`,
  `neighborhood`, `city`, `state`, `zipcode`), e também
  `data_online.professional_profile_cpf` (CPF — **não coletado**, ver
  "Não são objetivos"). Não há e-mail em nenhum campo do payload.
- **Rate limit exposto pela própria API** nos headers de resposta:
  `x-ratelimit-limit: 120`, `x-ratelimit-remaining: <N>` (por hora, a
  julgar pela ordem de grandeza) — o scraper deve respeitar essa margem
  (parar/desacelerar se `x-ratelimit-remaining` chegar perto de 0) além do
  delay aleatório próprio.

## Arquitetura

Novo serviço de longa duração, seguindo o mesmo padrão do
`cfp-leads-service/` e `nfse-service/` existentes (pasta própria na raiz,
Dockerfile próprio, deploy como app separado no EasyPanel/VPS):

```
diretorio-leads-service/
  package.json          # Node.js (ESM) + cheerio — sem Playwright, nenhuma das
                         # duas fontes precisa de browser (ver Descoberta técnica)
  Dockerfile             # imagem node simples (node:20-alpine ou similar)
  src/
    sources/
      doctoralia.js        # descoberta via sitemap + fetch/cheerio por perfil
      nossosPsicologos.js  # descoberta via sitemap + fetch direto na API JSON
    db.js                  # cliente Postgres (pg), mesmo padrão do cfp-leads-service
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
   parse cheerio, extrai nome/especialidade/cidade (telefone/endereco
   ficam `null` — fonte não expõe), `upsert`.
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
3. Para cada slug novo: `GET /v1/patient/professional/{slug}` (headers
   `Accept`, `Referer`, `Origin`, `User-Agent` de navegador), extrai
   nome, CRP (`council.number` + `council.state`), especialidade
   (`schema.specialty_name`), cidade (`schema.city`), telefone
   (`clinic.telephone`) e endereço (`clinic.address.*`, concatenado numa
   string), **descarta explicitamente** `data_online.professional_profile_cpf`.
   Filtra por cidade do RJ **depois** de obter o dado (não dá pra
   pré-filtrar pela URL do sitemap).
4. Delay aleatório de 1–2s entre requisições. Monitora o header
   `x-ratelimit-remaining` da resposta; se cair abaixo de uma margem de
   segurança (ex. 10), encerra o lote cedo em vez de arriscar `429`.
5. Ao fim do lote, grava `cursor` e `last_run_at`.

## Modelo de dados (Supabase)

```sql
create table leads_diretorio (
  fonte text not null,              -- 'doctoralia' | 'nossos_psicologos'
  slug text not null,                -- identificador da URL na fonte
  nome text not null,
  crp text,                          -- ex. '06/26833-SP'; null (Doctoralia não expõe)
  especialidade text,
  cidade text,
  telefone text,                     -- null pro Doctoralia (fonte não expõe)
  endereco text,                     -- null pro Doctoralia (fonte não expõe)
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

- **Coleta de telefone/WhatsApp/endereço é dado pessoal sob a LGPD**,
  mais sensível que o nome/CRP público já aceito no `leads_cfp`. Mitigado
  por: (1) exclusão deliberada do CPF (o campo realmente crítico, ver
  "Não são objetivos"); (2) uso restrito a prospecção comercial B2B
  (contato profissional, não dado de paciente); (3) dado já é exibido
  publicamente pelo próprio profissional no perfil do diretório (não é
  informação privada obtida por meio impróprio). Risco residual de
  reclamação/solicitação de exclusão por parte de algum profissional —
  aceito como risco operacional; se ocorrer, remoção pontual do registro
  em `leads_diretorio` resolve (decisão de negócio, não item de código
  desta entrega).
- **Mudança de HTML/sitemap/API em qualquer um dos dois sites** quebra o
  scraper daquela fonte sem aviso — sem contrato/SLA com nenhum dos dois.
  Aceito como risco operacional, mesma postura do `cfp-leads-service`.
- **Bloqueio de IP ou rate-limit (`429`)** por padrão de tráfego, mesmo
  respeitando robots.txt e usando delay — mitigado por ritmo conservador
  e pelo monitoramento do header `x-ratelimit-remaining` (Nossos
  Psicólogos), não garantido. Se ocorrer, reduzir volume/frequência é a
  mitigação manual (sem rotação de IP ou outra técnica de evasão).
- **Ambos são concorrentes diretos do PsiAgente.** Uso restrito a dado
  público, sem login, sem contornar paywall/captcha/autenticação,
  respeitando robots.txt de cada site. Risco residual de notificação de
  violação de ToS por parte deles; aceito como risco operacional, mesma
  decisão de negócio já tomada para o `leads_cfp`.

## Verificação

- Rodar um lote pequeno (ex. 50 perfis) de cada fonte manualmente antes
  de agendar o serviço definitivo, conferindo: upserts corretos em
  `leads_diretorio` (incluindo `telefone`/`endereco` preenchidos pro
  Nossos Psicólogos e nulos pro Doctoralia), filtragem correta por
  cidade do RJ, avanço do `cursor`, e que o delay entre requisições está
  sendo respeitado.
- Confirmar que nenhum registro em `leads_diretorio` tem CPF gravado em
  nenhuma coluna (checagem manual do schema e de uma amostra de linhas).
- Confirmar que nenhuma URL `/pesquisa?` (Doctoralia) é acessada durante
  a execução (checar logs de requisição do lote).
- Interromper o processo no meio de um lote e reiniciar, confirmando que
  ele retoma do `cursor` salvo (idempotência/retomada), por fonte.
