# Mensagens do agente de WhatsApp

O canal é a **Evolution API** (self-hosted, não a API oficial do WhatsApp/Meta
— decisão confirmada, não vai mudar). Por isso não existe fluxo de aprovação
de template: toda mensagem enviada pelo agente é texto livre, sem submissão
prévia à Meta e sem restrição de janela de 24h.

## Em produção (`WA - Inbound Router`)

### Boas-vindas ao vincular WhatsApp

Enviada assim que o código de verificação de 6 dígitos da tela
`/configuracoes/whatsapp` é confirmado com sucesso.

> Seu WhatsApp foi vinculado com sucesso! A partir de agora você pode
> consultar sua agenda, pagamentos e pacientes por aqui. Experimente
> perguntar: "quais atendimentos eu tenho hoje?"

### Mensagem de voz recebida

Resposta fixa — transcrição/entrada de áudio ainda não implementada
(adiado a pedido do usuário em 2026-08-25).

> Por enquanto só consigo entender mensagens de texto 🙂

### Demais respostas

Qualquer mensagem de texto dentro do fluxo normal é respondida livremente
pelo agente (Gemini), sem texto fixo pré-definido.

## Ainda não implementadas

Estas duas dependem de uma rotina de lembrete/cron que não existe —
fora de escopo da entrega atual do item 13 (junto com canal do paciente e
relatórios):

- **Lembrete de sessão** — no dia anterior à sessão.
- **Lembrete de pagamento em aberto** — sessão realizada sem pagamento
  vinculado após N dias.

Quando essa rotina for construída, revisar o tom/texto final com um
psicólogo antes de ativar em produção.
