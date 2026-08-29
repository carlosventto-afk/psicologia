-- 1) Responsavel financeiro "proprio": todo paciente ganha um
--    ResponsavelFinanceiro apontando pra si mesmo, e um vinculo N:N
--    consigo mesmo. Garante que o campo de responsavel no recebimento
--    nunca fica sem opcao (caso comum: paciente nao dependente).
insert into "ResponsavelFinanceiro" (nome, paciente_vinculado, owner)
select p.nome, p.id, p.owner
from "Paciente" p;

insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
select p.id, rf.id, p.owner
from "Paciente" p
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = p.id;

-- 2) Dependentes: vincula o dependente ao responsavel PROPRIO do
--    paciente que hoje e o seu responsavel_financeiro (reaproveita o
--    registro proprio dele em vez de criar um novo responsavel).
insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
select p.id, rf.id, p.owner
from "Paciente" p
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = p.responsavel_financeiro
where p.dependente = true and p.responsavel_financeiro is not null;

-- 3) Migra PagamentoSessao existentes para Recebimento/RecebimentoSessao,
--    reaproveitando o LancamentoFinanceiro ja existente (sem duplicar
--    receita). Responsavel usado: o "proprio" do paciente da sessao —
--    nao ha como saber quem pagou de fato nos dados historicos.
insert into "Recebimento" (paciente, responsavel_financeiro, data_recebimento, valor_total, forma_pagamento, conta, lancamento, owner)
select s.paciente, rf.id, ps.data_pagamento, ps.valor, ps.forma_pagamento, ps.conta, ps.lancamento, s.owner
from "PagamentoSessao" ps
join "Sessao" s on s.id = ps.sessao
join "ResponsavelFinanceiro" rf on rf.paciente_vinculado = s.paciente;

insert into "RecebimentoSessao" (recebimento, sessao, valor_aplicado, owner)
select r.id, ps.sessao, ps.valor, s.owner
from "PagamentoSessao" ps
join "Sessao" s on s.id = ps.sessao
join "Recebimento" r on r.lancamento = ps.lancamento;
