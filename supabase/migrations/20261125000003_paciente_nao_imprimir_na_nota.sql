-- Paciente.nao_imprimir_na_nota: quando marcado, a nota fiscal emitida no nome do responsavel
-- financeiro NAO traz o nome nem o CPF do paciente na descricao do servico (usa a descricao
-- padrao). Padrao false: a descricao com o paciente vale para quem nao for marcado, inclusive
-- os pacientes ja cadastrados. So adiciona a coluna (nada e reescrito nem removido).
alter table "Paciente"
  add column nao_imprimir_na_nota boolean not null default false;
