-- supabase/migrations/20261105000001_add_crp_conferido_usuarios.sql
--
-- Autocadastro passa a ser aprovado automaticamente e fica "sob revisao":
-- o admin confere se o CRP esta ativo e marca crp_conferido. Quem ja estava
-- aprovado antes desta migration conta como conferido.
-- Sem GRANT pra authenticated: so service_role (acoes de admin) escreve.
alter table "Usuarios"
  add column crp_conferido boolean not null default false;

update "Usuarios" set crp_conferido = true where aprovado = true;
