-- Plano do produto: define quais areas do sistema o usuario acessa.
-- 'gestao' = so sistema de gestao (agenda/financeiro/pacientes/etc).
-- 'gestao_marketing' = gestao + diretorio publico (comportamento de hoje).
-- 'marketing' = so diretorio publico, sem acesso as telas de gestao.
-- Nasce 'gestao' pra todo mundo (novo e existente) -- verificado que
-- nenhum perfil esta visivel no diretorio hoje, entao ninguem perde
-- acesso real com esse default.
alter table public."Usuarios"
  add column plano text not null default 'gestao'
    check (plano in ('gestao', 'gestao_marketing', 'marketing'));
