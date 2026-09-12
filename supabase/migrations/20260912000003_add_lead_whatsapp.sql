-- Agente comercial via WhatsApp (item 24, parte 4). nome vira opcional
-- porque um lead de WhatsApp existe antes do agente saber o nome da
-- pessoa; aguardando_humano pausa o bot pra deixar o ADM responder
-- direto pelo WhatsApp normal (mesmo numero).
alter table "Lead" alter column nome drop not null;

alter table "Lead" add column aguardando_humano boolean not null default false;

alter table "Lead" drop constraint "Lead_origem_check";
alter table "Lead" add constraint "Lead_origem_check"
  check (origem in ('cadastro', 'manual', 'whatsapp'));

-- Escopado so a origem='whatsapp': upsert idempotente pro fluxo de
-- inbound (um numero = um lead, nao duplica a cada mensagem), sem
-- restringir telefone repetido em leads manuais/de cadastro.
create unique index lead_telefone_whatsapp_uidx on "Lead" (telefone)
  where origem = 'whatsapp';

alter table "LeadNota" add column autor text not null default 'admin'
  check (autor in ('admin', 'lead', 'agente'));
