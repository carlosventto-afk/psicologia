-- Leads capturados pelo comparativo publico Carne-Leao x Simples Nacional.
alter table "Lead" drop constraint "Lead_origem_check";
alter table "Lead" add constraint "Lead_origem_check"
  check (origem in ('cadastro', 'manual', 'whatsapp', 'comparativo'));
