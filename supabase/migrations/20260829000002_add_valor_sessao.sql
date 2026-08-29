-- Valor da sessao passa a ser gravado na propria Sessao (fonte da
-- verdade para cobranca), em vez de sempre herdado via join de
-- Paciente.valor_sessao. Sessoes existentes recebem o valor atual do
-- paciente vinculado; sessoes novas usam esse mesmo valor como default,
-- mas ficam editaveis independente do cadastro do paciente.
alter table "Sessao" add column valor numeric;

update "Sessao" s
set valor = p.valor_sessao
from "Paciente" p
where s.paciente = p.id
  and s.valor is null;

alter table "Sessao" alter column valor set not null;
