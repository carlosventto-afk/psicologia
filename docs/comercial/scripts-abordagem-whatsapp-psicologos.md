# Scripts de abordagem por WhatsApp — psicólogos

Material de consulta para convidar psicólogos a se cadastrarem no PsiAgente.
Substitua `[Nome]` e `[seu nome]` antes de enviar.

Link de cadastro: https://psiagente.com.br/cadastro
Diretório público: https://busca.psiagente.com.br

## Mensagem-chave

O cadastro é **gratuito** e o perfil entra no **diretório de psicólogos**, onde
pacientes encontram o profissional e chamam direto pelo WhatsApp. Sem custo e sem cartão.

## Trilha principal (4 mensagens)

### 1. Abertura (curta, sem vender)

> Oi, [Nome]! Tudo bem? Aqui é o [seu nome], do PsiAgente, um sistema de gestão para psicólogos. Posso te explicar em 2 linhas por que acho que vale para o seu consultório? 🙂

### 2. Valor (quando responder positivamente)

> O PsiAgente organiza seu consultório num lugar só:
>
> ✅ Agenda com sessões recorrentes
> ✅ Pacientes e anamnese com histórico
> ✅ Financeiro: recebimentos e despesas
> ✅ Link para o paciente completar o próprio cadastro
>
> E o melhor: **o cadastro é gratuito e seu perfil entra no nosso diretório de psicólogos** (busca.psiagente.com.br). Os pacientes te encontram e chamam direto no seu WhatsApp. Sem custo e sem cartão.

### 3. Convite

> Se quiser conhecer, é só se cadastrar aqui (leva poucos minutos): https://psiagente.com.br/cadastro
> Qualquer dúvida na configuração, me chama que eu te ajudo!

### 4. Follow-up (2 a 3 dias depois, se não respondeu)

> Oi, [Nome]! Só passando para ver se deu para olhar o PsiAgente. O cadastro e o perfil no diretório são gratuitos, então dá para testar sem compromisso. Posso te ajudar com alguma coisa?

## Se a pessoa responder "não" à abertura

Uma única resposta curta, sem insistir e sem follow-up depois.

**"Não, obrigado" / "Não tenho interesse"**

> Tudo bem, [Nome], obrigado por responder! Se um dia quiser organizar a agenda ou aparecer no diretório de psicólogos, o cadastro é gratuito em psiagente.com.br/cadastro. Bom trabalho! 🙂

**"Já uso outro sistema"** (iClinic, planilha etc.)

> Entendi, [Nome]! Sem problema. Só um detalhe: o perfil no nosso diretório (busca.psiagente.com.br) é gratuito e funciona sem você trocar de sistema. Se algum dia quiser, é só me chamar. Bom trabalho!

**"Não tenho tempo agora"**

> Sem problema! Quando for um momento melhor, o cadastro leva poucos minutos: psiagente.com.br/cadastro. Fico à disposição. 🙂

**"Quem é você? / Como pegou meu número?"**

> Desculpe o contato, [Nome]! Peguei seu contato no [origem real: perfil profissional público, indicação etc.]. Se preferir, não envio mais mensagens. Sem problema nenhum.

## Respostas para dúvidas comuns

- **"Quanto custa?"** Grátis para começar, com agenda, pacientes e financeiro. Quem quiser
  agente de WhatsApp, recibo/NFS-e e Carnê-Leão assina um plano pago a partir de
  R$ 39,90/mês, opcional.
- **"Preciso de cartão?"** Não, para o plano Grátis.

### Planos (fonte: `web/lib/planos.js`)

| Plano | Preço/mês | Inclui |
| --- | --- | --- |
| Grátis | R$ 0 | Agenda, financeiro, pacientes, anamnese, diretório (1 consultório) |
| Psi Gestão | R$ 49,90 | Gestão completa + agente de WhatsApp, recibo/NFS-e, Carnê-Leão (sem diretório) |
| Psi Gestão + Marketing | R$ 79,90 | Tudo de gestão + diretório |
| Psi Marketing | R$ 39,90 | Só diretório |

## Regras de conduta

- Não insista depois de um "não". Uma resposta educada encerra a conversa.
- Registre quem recusou e não reenvie, para evitar denúncia de spam no seu número.
- Se pedirem para parar de receber mensagens, pare na hora (direito do titular pela LGPD).
- Tom informativo, sem prometer captação de pacientes ou resultado (regras do CFP sobre
  divulgação).
- Não afirme nada sobre LGPD/segurança que você não possa demonstrar.

## Pontos em aberto

- **Aprovação do perfil no diretório:** em 2026-11-04 o código gravava `aprovado: false`
  no autocadastro (`web/lib/actions/auth.js:84`), e o diretório só exibe perfis aprovados.
  O texto acima promete "perfil no diretório"; confirme se a aprovação é automática ou
  manual antes de enviar em escala.
- **Origem do contato:** se vier de base coletada (ex.: scraper de leads), revisar a base
  legal antes de disparar em escala.
