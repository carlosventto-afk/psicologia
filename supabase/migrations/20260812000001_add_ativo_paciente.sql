-- Permite "desativar" um paciente (esconder das listas/seletores do dia
-- a dia) sem excluir de fato — usado quando a exclusão real é bloqueada
-- por sessão/recibo/recorrência vinculado, ou quando o profissional só
-- quer arquivar um paciente que encerrou o acompanhamento.
alter table public."Paciente"
  add column ativo boolean not null default true;
