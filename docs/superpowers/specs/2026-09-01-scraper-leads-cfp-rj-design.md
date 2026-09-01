# Extrator de leads do CFP (psicólogos ativos do RJ)

**Status:** aprovado, pronto para plano de implementação.

## Objetivo

Gerar e manter atualizada, dentro do Supabase do PsiAgente, uma base de
psicólogos registrados na 05ª Região (RJ) do Conselho Federal de Psicologia
(`cadastro.cfp.org.br`) — nome, número de CRP, situação (ativo/cancelado/
transferido) e data de inscrição. Essa base serve como universo de
prospecção (leads) para o time comercial do PsiAgente: psicólogos com CRP
ativo no RJ que ainda não são clientes.

Execução recorrente, no mínimo mensal, para capturar novos registros.

## Não são objetivos desta entrega

- **Dado de contato** (e-mail, telefone, endereço, WhatsApp). O cadastro
  público do CFP não expõe nada disso (esperado, LGPD) — a busca só retorna
  nome, região, nº de registro, situação e data de inscrição. Enriquecimento
  de contato é um projeto à parte, com técnica bem diferente, fora de
  escopo aqui.
- **Filtro por cidade/bairro/especialidade** — a API do CFP não oferece
  esse filtro; só nome (substring, mín. 3 caracteres), nº de registro ou
  CPF. Não é possível reduzir o escopo geograficamente dentro do estado.
- **Recontagem de situação de registros já vistos.** O scraper avança
  sequencialmente por número de registro novo; ele não volta
  periodicamente para reverificar se um profissional já capturado mudou de
  ATIVO para CANCELADO (ou vice-versa). Ampliar para isso é uma extensão
  futura, não parte desta entrega.
- **Qualquer forma de burlar o reCAPTCHA** — resolução automática de
  desafio visível, serviços terceiros de captcha-solving, rotação de IP
  para mascarar origem, etc. Se o Google escalar para desafio visível, o
  scraper para e loga, não tenta contornar.
- Consulta de Pessoa Jurídica (clínicas) — só Pessoa Física nesta entrega.

## Descoberta técnica (investigação feita via chrome-devtools)

- Por trás do formulário em `cadastro.cfp.org.br`, a busca real é:
  `GET https://cn-api.cfp.org.br/psi/busca?nome=&regiao=5&registro={N}&cpf=&recaptchaToken={token}&tipo=PF`
- **Confirmado:** buscar só por `registro` (nome vazio) retorna exatamente
  o profissional daquele número, quando existe — testado com o registro
  26274 (RJ), retornou 1 resultado (`ADRIANA ACRI`, ATIVO). Isso permite
  varredura sequencial determinística por número de registro, muito mais
  confiável do que tentar cobrir por substrings de nome (que é o único
  outro filtro disponível e não garante cobertura completa).
- Números de registro observados no RJ (05ª Região) vão de valores baixos
  (ex. 6748, de 1983) até ~86.000+ (registro mais recente visto: 86094,
  inscrito em 06/03/2026) — sequência própria da região, crescendo com o
  tempo.
- **Toda consulta exige um `recaptchaToken`** gerado pela execução real do
  reCAPTCHA v2 invisible (site key `6LdhVd8UAAAAAL9RbkzRrEAloAp9dWfemA7kJ5oP`)
  na página. Isso descarta chamar a API HTTP diretamente — é necessário
  automação de navegador real (Playwright) navegando e preenchendo o
  formulário de fato, para que o token seja gerado organicamente.
- Sem paginação: cada busca por registro único retorna 0 ou 1 resultado.

## Arquitetura

Novo serviço de longa duração, seguindo o mesmo padrão do `nfse-service/`
existente no repo (pasta própria na raiz, Dockerfile próprio, deploy como
app separado no EasyPanel/VPS):

```
cfp-leads-service/
  package.json          # Node.js (CommonJS, como o resto do projeto) + Playwright
  Dockerfile             # imagem com Chromium (mcr.microsoft.com/playwright base)
  src/
    crawler.js            # driver Playwright: preenche form, lê resultado
    supabase.js            # cliente Supabase (upsert leads_cfp, ler/gravar state)
    scheduler.js            # loop principal: roda 1 lote, dorme até o próximo horário
    index.js                  # entrypoint
```

**Por que rodar na VPS, não localmente ou numa sessão do Claude Code:** o
backfill inicial (~86 mil números, a um ritmo seguro de ~3,5s/consulta ≈
1.000/hora) precisa correr em lotes diários por várias semanas, sem
supervisão. Isso não é viável numa sessão interativa. O container roda como
processo de longa duração (mesmo padrão do `nfse-service`), fazendo seu
próprio agendamento interno (dorme até o próximo horário do lote) em vez de
depender de cron externo do EasyPanel.

## Algoritmo de varredura

1. Ao acordar, lê `max_registro_checked` para `crp_regiao = 5` em
   `leads_cfp_scan_state` (0 na primeira execução).
2. Abre o Chromium (Playwright), navega até `cadastro.cfp.org.br`, seleciona
   "Rio de Janeiro - CRP 5ª Região" na busca avançada.
3. Para cada `registro` de `max+1` até `max+TAMANHO_LOTE`:
   - Preenche o campo "Número de registro", clica "Buscar", espera o
     resultado.
   - 1 resultado → `upsert` em `leads_cfp` (nome, registro, situação, data
     de inscrição, `last_checked_at = now()`).
   - 0 resultados → número não existe (gap na sequência); apenas avança.
   - Erro de rede/timeout → até 3 retentativas com backoff; se persistir,
     encerra o lote e mantém `max_registro_checked` no último número
     processado com sucesso (retomável).
   - **reCAPTCHA escalar para desafio visível, ou `422` de
     `recaptchaToken` se repetir 2x seguidas** → encerra o lote
     imediatamente, grava um alerta (linha em `leads_cfp_scan_state` com
     `last_error`), não tenta de novo até o próximo agendamento.
   - Delay aleatório de 2,5–5s entre cada consulta (nunca em rajada).
4. Ao fim do lote (sucesso ou parada por erro), grava
   `max_registro_checked` e `updated_at`, dorme até o próximo horário
   agendado.

**Tamanho do lote e frequência:** ~3.000 números/dia (~3h de execução por
dia, dentro do ritmo seguro). Backfill completo (~86 mil) termina em
~29 dias corridos. Depois disso, a varredura natural já vira manutenção
mensal leve (poucas dezenas/centenas de registros novos por mês).

## Modelo de dados (Supabase)

```sql
create table leads_cfp (
  crp_regiao smallint not null default 5,
  crp_registro integer not null,
  nome text not null,
  situacao text not null,          -- ATIVO | CANCELADO | TRANSFERIDO | ...
  data_inscricao date,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (crp_regiao, crp_registro)
);

create table leads_cfp_scan_state (
  crp_regiao smallint primary key,
  max_registro_checked integer not null default 0,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
```

Consumo de leads (fora de escopo desta entrega, mas é o uso pretendido):
`select * from leads_cfp where situacao = 'ATIVO'`.

## Observabilidade

Sem dashboard dedicado nesta entrega. Verificação é por consulta direta ao
Supabase: `max_registro_checked` e `last_run_at` em
`leads_cfp_scan_state` mostram se o serviço está avançando; `last_error`
não-nulo indica que o último lote parou por erro/captcha e precisa de
checagem manual.

## Riscos conhecidos

- **Escalonamento do reCAPTCHA para desafio visível** sob volume alto ou
  padrão de tráfego muito uniforme — mitigado por delay aleatório e ritmo
  conservador, mas não é garantido. Se acontecer com frequência, o volume
  diário precisa ser reduzido (não há solução automática — é o limite
  deliberado do design).
- **Chromium headless em servidor pode ter fingerprint ligeiramente
  diferente de um navegador desktop comum**, o que pode influenciar o score
  do reCAPTCHA. Mitigação: usar o Chromium empacotado do Playwright em modo
  `headless: 'new'` (mais próximo de um navegador real que o headless
  clássico) com viewport e user-agent padrão de desktop.
- **Mudança no site/API do CFP** (novo formulário, novo endpoint, novo site
  key do reCAPTCHA) quebra o scraper sem aviso — não há contrato/SLA do
  CFP. Aceito como risco operacional; requer ajuste manual quando ocorrer.

## Verificação

- Rodar um lote pequeno (ex. 50 registros) manualmente antes de agendar o
  serviço definitivo, conferindo: upserts corretos em `leads_cfp`, avanço
  de `max_registro_checked`, e que o delay entre requisições está sendo
  respeitado (sem rajada).
- Interromper o processo no meio de um lote e reiniciar, confirmando que
  ele retoma do `max_registro_checked` salvo (idempotência/retomada).
