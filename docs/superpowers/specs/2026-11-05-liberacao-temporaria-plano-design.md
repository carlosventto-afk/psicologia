# Liberação temporária de plano avançado pelo admin (item 22)

## Intenção

O admin precisa deixar um profissional experimentar um plano pago sem cobrança, por um
período limitado, e ver a conta voltar sozinha ao plano Grátis no fim, sem surpresa:
o profissional é avisado 3 dias antes. Objetivo comercial: converter teste em assinatura.

## Objetivos

- Botão de ação por profissional em `/admin/profissionais` (tela já existente, hoje com
  `SeletorPlano` de atribuição manual) para ativar a liberação.
- Admin escolhe o plano (qualquer pago: `gestao`, `gestao_marketing`, `marketing`) e a
  duração em dias (padrão sugerido 14 — decisão minha, não do usuário).
- Aviso 3 dias antes do fim: e-mail via `enviarEmailResend` (`web/lib/email/resend.js`)
  + banner dentro do app (`/assinatura` e painel). Só e-mail; WhatsApp descartado pelo
  usuário (o usuário confirmou que e-mail + banner bastam).
- No fim do prazo: volta para `gratis` automaticamente, se não contratou plano pago.
- Admin vê quem está em teste e até quando; pode encerrar antes ou estender.

## Não-objetivos / anti-objetivos

- Não é cobrança nem gateway: nada é criado no Asaas durante o teste.
- Não pode derrubar quem já paga: um usuário com plano pago (`plano_pago` preenchido ou
  `assinatura_status = 'ativa'`) não recebe liberação, e o job de expiração nunca
  rebaixa quem contratou plano pago durante o teste.
- Não usa a função de atribuição manual de plano (`SeletorPlano`/`profissionais.js:157`)
  como mecanismo: ela não tem prazo. Essa continua existindo, separada.
- Não há teste automatizado (projeto não tem framework); verificação é ponta a ponta com
  dados descartáveis, como nos itens anteriores.

## Decisões do usuário

1. Botão de ação na tela de usuários cadastrados do admin.
2. Fim do período: volta ao plano Grátis.
3. Aviso 3 dias antes de acabar, dizendo que será migrado para o Grátis se não
   contratar um plano pago.
4. Confirmado: e-mail + banner, duração/plano escolhidos pelo admin ao clicar,
   contratar plano pago durante o teste encerra o teste e vale a cobrança normal,
   quem já paga não pode receber liberação.

## Desenho técnico (base no que já existe)

Contexto já no código: `Usuarios.plano` é o plano efetivo; `plano_pago` é o plano
realmente pago (Asaas); só `service_role` escreve colunas de plano/assinatura
(migration `20260827000001`, `authenticated` tem UPDATE só em colunas de perfil). Já
existe job diário `POST /api/assinaturas/aplicar-pendencias` (segredo
`ASSINATURA_CRON_SECRET`, header `x-cron-secret`) que faz downgrades pendentes e
expira carência de inadimplentes — o padrão a seguir, gravando auditoria em
`EventoAssinatura`.

Peças:
- **Migration**: em `Usuarios`, `teste_plano text` (check nos 3 planos pagos),
  `teste_expira_em timestamptz`, `teste_aviso_enviado_em timestamptz`. Nenhum GRANT novo
  para `authenticated` (só service_role escreve).
- **Server action de admin** (`web/lib/actions/profissionais.js`): `liberarTestePlano`,
  `encerrarTestePlano`, `estenderTestePlano`. Valida `role === 'admin'`, recusa se o alvo
  paga, grava `plano = teste_plano`, `teste_expira_em = agora + dias`, zera
  `teste_aviso_enviado_em`, registra `EventoAssinatura` (tipo `teste_liberado` etc.).
- **UI admin**: em `/admin/profissionais`, botão "Liberar teste" (plano + dias) por
  profissional; selo "Em teste até DD/MM" com "Encerrar" e "Estender".
- **Job**: estender `aplicar-pendencias` com dois passos — (a) expirar: onde
  `teste_expira_em <= agora` e `plano_pago is null`, setar `plano = 'gratis'` e limpar
  `teste_*`; (b) avisar: onde `teste_expira_em <= agora + 3 dias`,
  `teste_aviso_enviado_em is null` e ainda não expirou, enviar e-mail e gravar
  `teste_aviso_enviado_em`. Falha de e-mail não pode impedir a expiração; não marcar o
  aviso como enviado se o envio falhou (tentar de novo no dia seguinte).
- **Contratação durante o teste**: ao ativar plano pago (webhook Asaas, branch de
  confirmação em `web/app/api/asaas/webhook/route.js`, e fluxo em
  `web/lib/actions/assinatura.js`), limpar `teste_*`.
- **Banner**: componente exibido quando `teste_expira_em` está definido: "Seu teste do
  plano X termina em N dias; depois voltará ao Grátis. Contratar".
- `buscarUsuarioAtual` (`web/lib/data/usuario.js`) passa a incluir os campos `teste_*`.

## Deixado ao implementador

Textos exatos do e-mail/banner, layout do formulário de liberação, nomes de tipo de
evento, tratamento de fuso (job roda por data; aviso "3 dias" aceita margem de ±1 dia).

## Risco conhecido — RESOLVIDO (2026-11-05)

O job `aplicar-pendencias` está agendado e rodando em produção: workflow n8n
"Assinaturas - Aplicar Pendencias (diario)" ativo, 6 execuções diárias consecutivas com
sucesso (de 30/10 a 04/11, ~14h UTC), e `ASSINATURA_CRON_SECRET` presente no app. Nenhuma
tarefa de infra necessária; o n8n chama a mesma rota que vamos estender, então a
expiração e o aviso do teste rodam sem mudança de agendamento.

## Resoluções da revisão do construtor

Respondidas pelo código (verificado):
- **Quem "paga"**: elegível a receber teste apenas quem tem `plano = 'gratis'` e
  `plano_pretendido is null`. Cobre inadimplente (`plano` só vira gratis após a carência),
  cancelado-ainda-no-período e downgrade pendente: todos têm `plano` ≠ gratis ou
  `plano_pretendido` preenchido, logo ficam bloqueados.
- **Contratar durante o teste**: o webhook (`web/app/api/asaas/webhook/route.js:54-60`) já
  grava `plano` e `plano_pago` a partir de `plano_pretendido` na confirmação do
  pagamento, mesmo que seja plano diferente do teste. Basta limpar `teste_*` ali. O
  checkout apenas pendente NÃO cancela o teste (só pagamento confirmado): se o teste
  expirar no meio, o webhook posterior ainda promove a conta ao plano contratado.
- **Outros leitores de `plano`**: só gates de recurso (`PLANOS[usuario.plano]`), então a
  liberação funciona sem mudar nenhum. A atribuição manual `SeletorPlano` passa a limpar
  `teste_*` (a decisão manual do admin sobrepõe o teste), para o job de expiração não
  rebaixar um plano atribuído à mão.
- **E-mail**: vai para `Usuarios.email` (já selecionado em `listarProfissionais`). Não há
  subusuários; banner só para o próprio profissional.

Decisões minhas (marcadas, simples de reverter):
- **Estender**: soma dias ao fim atual (ou a agora, se já expirou e ainda é teste), mantém
  o plano e rearma o aviso (`teste_aviso_enviado_em = null`).
- **Reconceder**: permitido, sem limite; histórico fica em `EventoAssinatura`.
