-- Coluna nova pra liberacao temporaria de plano avancado pelo admin (item 22
-- do backlog). Sem grant extra: "Usuarios" ja tem UPDATE revogado a nivel de
-- tabela pra authenticated (migration 20260827000001), entao colunas novas
-- ja nascem sem grant nenhum -- so service_role (admin) escreve aqui.
alter table "Usuarios" add column plano_teste_expira_em timestamptz;
