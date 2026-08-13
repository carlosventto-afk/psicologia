# Item 9 do backlog — Envio automático periódico do TXT do Carnê-Leão

**Status:** aprovado, pronto para implementação.

## Objetivo

Automatizar o item 8 (já implementado): gerar o TXT do Carnê-Leão sozinho,
num intervalo configurável por profissional, e mandar por e-mail (do
próprio profissional ou de um terceiro, ex: contador) — sem precisar
lembrar de gerar manualmente pela tela `/carne-leao`.

Depende do item 8, já implementado.

## Contexto importante

Este app **não tem nenhum scheduler/cron de verdade hoje** nem nenhuma
infraestrutura de envio de e-mail (SMTP/Resend) — os e-mails de
autenticação (convite, redefinição de senha) são inteiramente geridos
pelo próprio Supabase Auth, não por código deste app. É tudo novo.

O item 10 do backlog ("marcar atendimento como já gerado em TXT", pra
evitar duplicidade) **ainda não foi implementado**. Este design evita
precisar dele: cada envio automático cobre só o delta de pagamentos desde
o último envio automático bem-sucedido daquele profissional, então não há
como um pagamento entrar em dois envios automáticos diferentes. O que
**não** está coberto: se o profissional também gerar manualmente pela tela
`/carne-leao` no meio do ciclo, esse download manual não é rastreado e pode
se sobrepor com o próximo envio automático — aceitável nesta primeira
versão, já que é uma ação separada e deliberada do profissional.

## Escolha de infraestrutura: n8n

Em vez de um scheduler embutido no processo Next.js (`node-cron`), a
automação roda em uma instância de **n8n** nova, implantada na mesma VPS
via EasyPanel (mesmo padrão de infra já usado pelo app principal — ver
memória `psifacil-deploy-infra`). Divisão de responsabilidades:

- **O app** possui toda a regra de negócio: quem está configurado, se está
  na data de enviar, o que gerar, e devolve isso pronto (TXT + e-mail de
  destino) num único endpoint.
- **O n8n** só agenda a chamada (nó de Cron) e distribui os e-mails (nó de
  SMTP nativo do n8n) — nenhuma regra de negócio fica dentro do workflow
  do n8n, que é bem mais difícil de revisar/versionar que código do app.

Essa divisão evita colocar lógica de negócio numa ferramenta visual difícil
de revisar, e evita o app precisar de sua própria integração de SMTP — o
n8n já resolve isso nativamente.

## Endpoint novo: `POST /carne-leao-automatico`

Fora do grupo de rotas autenticado (`app/(app)/...`) — quem chama é o n8n,
não um profissional logado no navegador. Duas camadas de proteção:

1. **`web/lib/supabase/proxy.js`**: adicionar `/carne-leao-automatico` ao
   array `PUBLIC_PATHS` (mesmo mecanismo já usado por `/login`,
   `/auth/callback` etc.) — sem isso, o proxy de sessão redireciona
   qualquer requisição sem cookie de login pra `/login` antes mesmo da
   rota rodar.
2. **A própria rota**: exige um header `X-Cron-Secret` comparado com uma
   env var nova (`CARNE_LEAO_CRON_SECRET`, string aleatória longa) antes de
   tocar no banco — sem o header correto, `401` imediato, nenhuma query.

Como não existe usuário logado nesse contexto (é uma chamada
máquina-a-máquina), a rota usa o client **service-role** do Supabase (o
mesmo padrão já usado nos scripts de verificação desta sessão, mas pela
primeira vez em código de produção do app) pra consultar todos os
profissionais de uma vez, ignorando RLS. Isso é uma exceção deliberada e
pontual ao padrão de todo o resto do app (que sempre opera sob RLS do
usuário logado) — só esta rota, protegida pelo segredo, tem esse acesso.

### O que a rota faz

1. Valida `X-Cron-Secret`. Sem bater, `401`.
2. Busca (service-role) todos os `Usuarios` com
   `carne_leao_frequencia is not null`.
3. Pra cada um, decide se está "na data" (ver regra por frequência abaixo)
   comparando `carne_leao_frequencia` e `carne_leao_ultimo_envio` com a
   data de hoje.
4. Pros que estão na data: calcula o período (ver regra por frequência),
   busca os pagamentos elegíveis nesse período (reaproveitando
   `listarPagamentosElegiveis` de `web/lib/data/carne-leao.js` — mesma
   função já usada pela tela manual, só que iterando por profissional em
   vez de "o usuário logado"), monta o TXT (reaproveitando
   `montarArquivoTxt` de `web/lib/carne-leao-txt.js`), e registra uma linha
   em `EnvioAutomaticoCarneLeao`.
5. Se não houver nenhum pagamento elegível no período (nada novo desde o
   último envio), **não** conta como enviado — não atualiza
   `carne_leao_ultimo_envio` nem manda nada ao n8n pra esse profissional,
   pra não gerar e-mail vazio toda semana.
6. Devolve ao n8n um JSON com a lista de quem deve receber e-mail agora:
   `[{ email, nomeArquivo, conteudoBase64 }, ...]` — o n8n itera essa
   lista (nó "Split In Batches" + nó de e-mail) e manda um e-mail por
   item, anexando o TXT.
7. **Nota de acoplamento**: `listarPagamentosElegiveis` hoje usa o client
   por-sessão (`createClient()`, RLS do usuário logado) — pra reaproveitá-la
   aqui, ou ela precisa aceitar um client Supabase como parâmetro opcional
   (service-role, já autorizado a ver qualquer `owner`), ou a rota
   duplica a query filtrando por `owner` manualmente. A primeira opção é
   preferível (evita duplicar a query em dois lugares) — decisão de
   implementação, não muda o comportamento.

`carne_leao_ultimo_envio` só é atualizado **depois** de a rota devolver a
resposta com sucesso pro n8n — não há confirmação de que o e-mail de fato
chegou (isso é responsabilidade do n8n, que já tem retry/log de execução
próprios); o app só sabe que gerou e entregou o conteúdo ao n8n. Manter
simples nesta primeira versão.

## Schema novo

```sql
alter table "Usuarios"
  add column carne_leao_frequencia text check (carne_leao_frequencia in ('semanal', 'quinzenal', 'mensal')),
  add column carne_leao_email text,
  add column carne_leao_ultimo_envio date;

create table "EnvioAutomaticoCarneLeao" (
  id bigint generated by default as identity primary key,
  usuario bigint not null references "Usuarios"(id),
  executado_em timestamptz not null default now(),
  sucesso boolean not null,
  mensagem_erro text,
  quantidade_linhas int not null default 0
);
```

- `carne_leao_frequencia` nulo = desativado (padrão de todo profissional
  hoje).
- `carne_leao_email` nulo = usa o e-mail de login do profissional (via
  Supabase Auth) como destino.
- `carne_leao_ultimo_envio` nulo até o primeiro envio automático
  bem-sucedido.

## UI: `/configuracoes/conta`

Nova seção no formulário já existente (`MeusDadosForm.js`, ao lado dos
campos de CPF/CRP/celular já implementados no item 8): select de
frequência (Desativado / Semanal / Quinzenal / Mensal) + campo de e-mail
opcional, com texto de apoio "deixe em branco pra usar seu e-mail de
login".

## Regra de período por frequência

Este é o ponto mais delicado do design — cada frequência calcula o
período de forma diferente:

- **Mensal**: sempre o **mês anterior completo** (mesma função
  `calcularPeriodo("mes", ...)` já usada na tela manual, aplicada ao mês
  anterior ao mês corrente). O n8n dispara esse gatilho uma vez por mês
  (ex: todo dia 3, dando margem pra pagamentos registrados com atraso nos
  primeiros dias do mês). Não depende de `carne_leao_ultimo_envio` — é
  sempre "o mês passado inteiro", enviado uma vez por mês.
- **Semanal / Quinzenal**: delta desde `carne_leao_ultimo_envio` (ou desde
  o início do mês corrente, se nunca enviou), limitado a **nunca cruzar
  virada de mês** — se o último envio foi em abril e hoje já é maio, o
  delta fica limitado ao que sobrou de abril (`dataFim` = último dia de
  abril); o pedaço de maio só entra no próximo ciclo, quando "desde o
  início do mês corrente" já cobre maio. Isso respeita a regra do
  próprio layout do Carnê-Leão ("todos os pagamentos devem ser referentes
  ao mesmo ano/mês"). O n8n dispara esse gatilho semanalmente (ex: toda
  segunda-feira) — a rota decide profissional a profissional se já se
  passaram 7 (semanal) ou 14+ (quinzenal) dias desde
  `carne_leao_ultimo_envio`.

## Fora de escopo

- Confirmação de entrega do e-mail (só o n8n sabe se o SMTP realmente
  entregou) — fica pro log de execução do próprio n8n, não aparece dentro
  do app nesta versão.
- Item 10 (marcar atendimento como já exportado) — evitado por design via
  o delta desde o último envio, não é pré-requisito deste item.
- Tela de histórico de envios automáticos dentro do app (a tabela
  `EnvioAutomaticoCarneLeao` existe pra auditoria futura, mas nenhuma UI
  pra visualizá-la é construída agora).
- Configurar/implantar o n8n em si (criação do serviço no EasyPanel,
  configuração do nó de Cron e do nó de SMTP) é trabalho de infraestrutura
  fora do escopo de código deste plano — só o endpoint do lado do app é
  construído aqui.
