-- Documentos do paciente (CPF/RG) e responsável financeiro: nem todo
-- paciente é quem paga — quando é dependente de outra pessoa (ex.: um
-- filho), o responsável financeiro é quem deve aparecer na emissão de
-- recibo/nota. Ambos os grupos de campo são opcionais.
alter table public."Paciente"
  add column cpf text,
  add column rg_numero text,
  add column rg_data_expedicao date,
  add column rg_orgao_emissor text,
  add column dependente boolean not null default false,
  add column responsavel_financeiro bigint references public."Paciente"(id);

-- Sem "on delete set null" de propósito: um SET NULL automático violaria
-- a constraint abaixo (dependente sem responsável). Deixar o padrão
-- (NO ACTION) significa que não dá pra excluir um paciente enquanto ele
-- ainda for responsável financeiro de alguém — precisa reatribuir ou
-- desmarcar o dependente antes.
alter table public."Paciente"
  add constraint paciente_dependente_precisa_responsavel
    check (dependente = false or responsavel_financeiro is not null);

alter table public."Paciente"
  add constraint paciente_responsavel_nao_pode_ser_proprio
    check (responsavel_financeiro is null or responsavel_financeiro <> id);
