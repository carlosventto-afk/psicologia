-- supabase/migrations/20260909000001_add_apelido_paciente.sql
--
-- Campo livre pra registrar o apelido/codinome pelo qual o profissional
-- conhece o paciente, quando for diferente do nome completo cadastrado.
-- Usado pra ajudar a identificar o paciente em listas, busca e no
-- seletor de sessão.
alter table "Paciente" add column apelido text;
