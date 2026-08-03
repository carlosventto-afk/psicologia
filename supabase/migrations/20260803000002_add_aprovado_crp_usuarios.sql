-- Autocadastro público de profissionais: estado de aprovação e CRP.
-- default true propositalmente — contas existentes e convites do admin
-- (fluxo já confiável) continuam aprovadas automaticamente; só o
-- autocadastro público passa aprovado: false explicitamente.
alter table "Usuarios" add column aprovado boolean not null default true;
alter table "Usuarios" add column crp text;
