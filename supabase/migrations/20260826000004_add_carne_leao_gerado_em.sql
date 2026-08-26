-- Item 10 do backlog: marca um PagamentoSessao como "ja entrou num TXT do
-- Carne-Leao" (manual ou automatico), pra geracao manual avisar antes de
-- incluir de novo e a automatica nunca incluir sem perguntar.
alter table "PagamentoSessao"
  add column carne_leao_gerado_em timestamptz;
