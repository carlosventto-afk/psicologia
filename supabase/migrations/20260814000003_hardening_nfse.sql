-- Hardening pos-revisao final do item 7 (NFS-e): 4 achados da revisao de
-- sistema completo (task-by-task ja tinha passado, isso e revisao cruzada).

-- Achado 1 (Critico): unique simples em pagamento_sessao bloqueia
-- re-emissao permanente apos nota rejeitada/cancelada. Troca por indice
-- unico parcial: so bloqueia enquanto existir nota pendente ou autorizada
-- para aquele pagamento -- nota rejeitada/cancelada libera o pagamento
-- para nova tentativa.
alter table "NotaFiscal" drop constraint "NotaFiscal_pagamento_sessao_key";

create unique index notafiscal_pagamento_ativo
  on "NotaFiscal" (pagamento_sessao)
  where status in ('pendente', 'autorizada');

-- Achado 3 (Importante): registrar_nota_fiscal_pendente nunca verificava
-- que o pagamento pertence ao profissional chamador. A funcao e
-- invoker-rights (UPDATE/INSERT internos ja protegidos por RLS), mas
-- nada impedia consumir numero e criar NotaFiscal 'pendente' para o
-- pagamento de outro profissional (ids sequenciais, enumeraveis),
-- bloqueando a emissao legitima via o indice unico parcial do achado 1.
create or replace function public.registrar_nota_fiscal_pendente(p_pagamento_sessao bigint)
returns table (id bigint, numero int, serie text, ambiente text)
language plpgsql
as $$
declare
  v_numero int;
  v_serie text;
  v_ambiente text;
  v_id bigint;
begin
  if not exists (
    select 1 from "PagamentoSessao" p
    join "Sessao" s on s.id = p.sessao
    where p.id = p_pagamento_sessao and s.owner = auth.uid()
  ) then
    raise exception 'Pagamento nao encontrado para este profissional';
  end if;

  update "DadosFiscaisProfissional" df
     set proximo_numero = df.proximo_numero + 1
   where df.owner = auth.uid()
  returning df.proximo_numero - 1, df.serie, df.ambiente into v_numero, v_serie, v_ambiente;

  if v_numero is null then
    raise exception 'Dados fiscais nao configurados para este profissional';
  end if;

  insert into "NotaFiscal" (owner, pagamento_sessao, status, ambiente, numero, serie)
  values (auth.uid(), p_pagamento_sessao, 'pendente', v_ambiente, v_numero, v_serie)
  returning "NotaFiscal".id into v_id;

  return query select v_id, v_numero, v_serie, v_ambiente;
end;
$$;

-- Achado 4 (Importante): a trava de irreversibilidade homologacao->producao
-- so dispara em UPDATE. DELETE + novo INSERT (RLS ja permite delete do
-- proprio owner) voltava silenciosamente pra homologacao E resetava
-- proximo_numero para 1, arriscando numeracao duplicada com NotaFiscal ja
-- emitidas (nao ha FK entre elas). Trava o DELETE quando ja existem notas.
create or replace function public.impedir_exclusao_dados_fiscais_com_notas()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from "NotaFiscal" where owner = old.owner) then
    raise exception 'Nao e possivel excluir dados fiscais com notas fiscais emitidas.';
  end if;
  return old;
end;
$$;

create trigger trg_impedir_exclusao_dados_fiscais_com_notas
  before delete on "DadosFiscaisProfissional"
  for each row
  execute function public.impedir_exclusao_dados_fiscais_com_notas();

-- Achado 7 (Menor): NotaFiscal.ambiente nao tinha o mesmo CHECK que
-- DadosFiscaisProfissional.ambiente ja tem.
alter table "NotaFiscal" add constraint notafiscal_ambiente_check check (ambiente in ('homologacao', 'producao'));
