# Runbook: nota fiscal "pendente" com resultado incerto

Para quem opera o sistema e vai rodar SQL no editor SQL do Supabase. Não precisa saber programar, mas siga os passos na ordem e **nunca emita a nota de novo antes de resolver** (veja a regra de ouro no fim).

## O que é uma nota pendente incerta

Ao emitir uma NFS-e, o sistema envia o pedido (DPS) à prefeitura/SEFIN e espera a resposta. Se a conexão cai ou a SEFIN demora demais (timeout, erro 5xx), o sistema **não sabe** se a nota foi autorizada ou não. Para não gerar nota em duplicidade, ele deixa a nota como `pendente`, com um texto em `ultimo_erro` começando por "Resultado incerto; confirme no portal da NFS-e antes de emitir de novo".

Enquanto estiver `pendente`, o sistema bloqueia uma nova emissão para a mesma cobrança/sessão e esconde o botão "Emitir nota". O profissional recebe um e-mail de alerta (uma vez) quando a nota fica pendente por mais de 2 horas. É o sinal para seguir este runbook.

## Caminho preferido: botão "Verificar na SEFIN"

Na tela da cobrança (card "Nota fiscal") e em "Notas Fiscais", toda nota pendente com resultado incerto mostra o botão **Verificar na SEFIN** (o dono da nota ou um admin pode usar). O sistema consulta a DPS da nota (derivada de CNPJ/CPF do prestador, série e número) na SEFIN e:

- **a SEFIN tem a nota**: a nota vira `autorizada` (chave, XML e PDF gravados quando a SEFIN os devolve) e a entrega ao paciente é acionada;
- **a SEFIN responde 404 (não existe)**: a nota vira `rejeitada` ("Verificado na SEFIN: a nota não foi emitida.") e a cobrança volta a mostrar "Tentar de novo" (um número novo de DPS é reservado na reemissão);
- **a SEFIN não responde ou a resposta é ambígua**: nada muda; aparece uma mensagem pedindo para tentar de novo depois. Nunca reemita nesse caso.

O botão só aparece para nota pendente com erro de resultado incerto, ou pendente há mais de 10 minutos (para não interferir numa emissão em andamento). Se o botão não resolver, use o caminho manual abaixo.

## Caminho manual (alternativa): SQL

### Passo 1: achar a nota no banco

```sql
select id, status, numero, serie, ambiente, dps_id, chave_acesso, ultimo_erro, cobranca, recebimento_sessao, created_at
from "NotaFiscal"
where status = 'pendente'
order by created_at;
```

Anote o `id`, o `numero`/`serie` e o `dps_id` da nota que você vai conferir. Confira também o `ambiente`: se for `homologacao`, a nota é de teste e não existe no portal de produção (nesse caso, trate como "não existe", caso (a) abaixo).

### Passo 2: conferir no portal

1. Acesse a consulta pública da NFS-e Nacional: https://www.nfse.gov.br/ConsultaPublica (ou a "Consulta pública" no site nfse.gov.br).
2. Se tiver a **chave de acesso** (50 dígitos), informe-a. Normalmente uma nota incerta ainda não tem chave; nesse caso, entre no portal do contribuinte (nfse.gov.br/EmissorNacional) com o certificado digital do profissional e abra "Notas emitidas".
3. Procure uma nota do período, com o **mesmo tomador (paciente/responsável), mesmo valor e mesma data de competência**. O número da DPS (`dps_id`, ou série/número da nota) também aparece nos detalhes.
4. Conclua: a nota **existe e está autorizada**, ou **não existe** (nenhuma nota com esses dados).

Se o portal estiver fora do ar ou você não tiver certeza, **não faça nada**: deixe `pendente` e tente de novo mais tarde.

### Passo 3a: o portal NÃO mostra a nota

A nota não foi autorizada. Marque como rejeitada para liberar nova emissão (a cobrança volta a mostrar "Tentar de novo"; a sessão volta a poder ser emitida em "Notas Fiscais"):

```sql
update "NotaFiscal"
set status = 'rejeitada',
    ultimo_erro = 'Conferido no portal da NFS-e: nota não encontrada; liberada manualmente para nova emissão.'
where id = <ID_DA_NOTA>
  and status = 'pendente';
```

Depois, emita normalmente pelo botão da cobrança (ou da tela Notas Fiscais, nas notas por sessão).

### Passo 3b: o portal mostra a nota AUTORIZADA

A nota existe; o sistema só não soube. Copie do portal a chave de acesso (50 dígitos) e registre:

```sql
update "NotaFiscal"
set status = 'autorizada',
    chave_acesso = '<CHAVE_DE_ACESSO_50_DIGITOS>',
    ultimo_erro = 'Autorizada confirmada manualmente no portal da NFS-e.'
where id = <ID_DA_NOTA>
  and status = 'pendente';
```

Os campos `xml_nfse` e `pdf_base64` podem ficar vazios. O que acontece na entrega ao paciente: o job de reprocessamento (a cada hora) encontra a nota autorizada e tenta entregar. Sem o XML, o **e-mail falha** ("XML da nota ausente"); o **WhatsApp** (se o paciente tem opt-in e telefone) envia só uma mensagem de texto com a chave de acesso, sem o PDF. Depois de 3 tentativas sem sucesso, o profissional recebe um e-mail de alerta. Se quiser que o paciente receba o PDF/XML, baixe-os do portal e envie por fora.

## Regra de ouro

**Nunca emita de novo antes de resolver a nota pendente.** Emitir de novo gasta um número novo de DPS e, se a primeira nota estava autorizada, o paciente fica com duas notas pelo mesmo serviço (a segunda precisaria ser cancelada). Só reemita depois de marcar a nota como `rejeitada` (passo 3a) ou de registrá-la como `autorizada` (passo 3b).

O botão "Verificar na SEFIN" (item 35) está implementado em código, mas ainda não foi implantado nem verificado contra a SEFIN real; até lá, vale o caminho manual.
