-- Corrige agent_excluir_pagamento: a decisao original de nao capturar
-- violacao de FK ("nada mais referencia PagamentoSessao/LancamentoFinanceiro")
-- ficou desatualizada com o item 7/NFS-e -- NotaFiscal.pagamento_sessao
-- referencia PagamentoSessao.id com on delete no action. Excluir um
-- pagamento que ja tem nota emitida levantava um 23503 (foreign key
-- violation) cru em vez de um codigo de negocio. Mesmo padrao de captura
-- ja usado em agent_excluir_sessao (20260817000003).
create or replace function public.agent_excluir_pagamento(
  p_whatsapp_number text,
  p_pagamento_id bigint,
  p_consultorio_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_pagamento_id bigint;
  v_lancamento_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select pg.id, pg.lancamento into v_pagamento_id, v_lancamento_id
  from "PagamentoSessao" pg
  join "Sessao" s on s.id = pg.sessao
  join "Paciente" p on p.id = s.paciente
  where pg.id = p_pagamento_id and p.consultorio = v_consultorio_id;

  if v_pagamento_id is null then
    raise exception 'PAGAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  delete from "PagamentoSessao" where id = v_pagamento_id;

  if v_lancamento_id is not null then
    delete from "LancamentoFinanceiro" where id = v_lancamento_id;
  end if;

  return true;
exception
  when foreign_key_violation then
    raise exception 'PAGAMENTO_TEM_NOTA_FISCAL' using errcode = 'P0001';
end;
$$;

revoke all on function public.agent_excluir_pagamento(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.agent_excluir_pagamento(text, bigint, bigint) to service_role;
