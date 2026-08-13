-- Documento fiscal que o paciente recebe: 'recibo' (Receita Saude, nome
-- do programa do governo) ou 'nota_fiscal' (NFS-e -- emissao real ainda
-- nao existe, ver backlog item 7). Vazio (null) = paciente nao recebe
-- nenhum documento, e fica de fora de qualquer geracao em lote (hoje ou
-- no futuro). Substitui o boolean precisa_recibo.
alter table public."Paciente"
  add column documento text check (documento in ('recibo', 'nota_fiscal'));

update public."Paciente" set documento = 'recibo' where precisa_recibo = true;

alter table public."Paciente" drop column precisa_recibo;
