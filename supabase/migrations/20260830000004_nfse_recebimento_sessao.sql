-- NFS-e emitia notas so a partir de PagamentoSessao (1 pagamento = 1
-- sessao = 1 nota). Como o codigo em web/ para de escrever em
-- PagamentoSessao, novas notas passam a ser emitidas a partir de
-- RecebimentoSessao (mesma granularidade: uma linha = uma sessao com um
-- valor aplicado). Notas ja emitidas mantem o vinculo antigo intacto
-- (pagamento_sessao vira opcional, nao e apagado).
alter table "NotaFiscal"
  alter column pagamento_sessao drop not null,
  add column recebimento_sessao bigint references "RecebimentoSessao"(id);

alter table "NotaFiscal"
  add constraint notafiscal_pagamento_ou_recebimento_check
    check (num_nonnulls(pagamento_sessao, recebimento_sessao) = 1);

-- Mesmo raciocinio do indice unico parcial de pagamento_sessao (ver
-- 20260814000003_hardening_nfse.sql): nota pendente/autorizada bloqueia
-- reemissao pro mesmo recebimento_sessao; rejeitada/cancelada libera.
create unique index notafiscal_recebimento_ativo
  on "NotaFiscal" (recebimento_sessao)
  where status in ('pendente', 'autorizada');

-- Mesmo tipo de parametro (bigint), so o nome muda (p_pagamento_sessao ->
-- p_recebimento_sessao). Postgres NAO permite renomear parametro de
-- entrada via CREATE OR REPLACE FUNCTION (erro 42P13: "cannot change
-- name of input parameter"), entao precisa DROP + CREATE explicito.
-- Como o tipo (bigint) e o nome da funcao sao os mesmos, isso substitui
-- a funcao existente sem deixar overload duplicado (mesma assinatura
-- nome+tipos de antes).
drop function if exists public.registrar_nota_fiscal_pendente(bigint);

create function public.registrar_nota_fiscal_pendente(p_recebimento_sessao bigint)
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
    select 1 from "RecebimentoSessao" rs
    join "Sessao" s on s.id = rs.sessao
    where rs.id = p_recebimento_sessao and s.owner = auth.uid()
  ) then
    raise exception 'Recebimento nao encontrado para este profissional';
  end if;

  update "DadosFiscaisProfissional" df
     set proximo_numero = df.proximo_numero + 1
   where df.owner = auth.uid()
  returning df.proximo_numero - 1, df.serie, df.ambiente into v_numero, v_serie, v_ambiente;

  if v_numero is null then
    raise exception 'Dados fiscais nao configurados para este profissional';
  end if;

  insert into "NotaFiscal" (owner, recebimento_sessao, status, ambiente, numero, serie)
  values (auth.uid(), p_recebimento_sessao, 'pendente', v_ambiente, v_numero, v_serie)
  returning "NotaFiscal".id into v_id;

  return query select v_id, v_numero, v_serie, v_ambiente;
end;
$$;
