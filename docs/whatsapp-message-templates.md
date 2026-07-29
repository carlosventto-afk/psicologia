# Templates de mensagem (WhatsApp Cloud API)

Mensagens iniciadas pela plataforma (fora da janela de 24h de conversa ativa)
exigem templates pré-aprovados pela Meta. Aprovação costuma levar 1-2 dias úteis.
Cadastrar em Meta Business Manager → WhatsApp Manager → Modelos de mensagem.

Convenção de variáveis: `{{1}}`, `{{2}}`, ... na ordem em que serão preenchidas
pelo workflow de cron no n8n.

## `lembrete_sessao` (categoria: UTILITY)

Enviado ao paciente (com opt-in) ou ao psicólogo, no dia anterior à sessão.

> Olá, {{1}}! Passando para lembrar da sua sessão amanhã, dia {{2}}, às {{3}}.
> Qualquer imprevisto, é só responder esta mensagem.

Variáveis: `{{1}}` nome do paciente, `{{2}}` data, `{{3}}` horário.

## `lembrete_pagamento` (categoria: UTILITY)

Enviado ao paciente (com opt-in), quando uma sessão realizada segue sem
pagamento vinculado após N dias (parametrizável, sugestão inicial: 3 dias).

> Olá, {{1}}! Notamos que a sessão do dia {{2}} (valor: R$ {{3}}) ainda está em
> aberto. Se já efetuou o pagamento, desconsidere esta mensagem.

Variáveis: `{{1}}` nome do paciente, `{{2}}` data da sessão, `{{3}}` valor.

## `boas_vindas_vinculo_whatsapp` (categoria: UTILITY)

Enviado ao psicólogo assim que o código de verificação da tela "Vincular
WhatsApp" é confirmado com sucesso — primeira mensagem que ele recebe do bot.

> Seu WhatsApp foi vinculado com sucesso à sua conta, {{1}}! A partir de
> agora você pode consultar sua agenda, pagamentos e pacientes por aqui.
> Experimente perguntar: "quais atendimentos eu tenho hoje?"

Variável: `{{1}}` nome do psicólogo.

---

## Observações

- Todo template precisa passar por revisão de política da Meta antes do uso —
  evitar linguagem promocional/marketing nesses três (categoria UTILITY, não
  MARKETING), já que são transacionais e têm aprovação mais rápida/estável.
- Mensagens de resposta dentro da janela de 24h (quando o próprio
  psicólogo pergunta algo) **não** precisam de template — o agente responde
  livremente via Claude nesse caso.
- Ajustar o texto final com um psicólogo/clínica piloto antes de submeter,
  para garantir tom adequado ao público.
