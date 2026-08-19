create or replace function public.agent_registrar_lancamento_despesa(
  p_whatsapp_number text,
  p_descricao text,
  p_valor numeric,
  p_data date default current_date,
  p_conta_id bigint default null,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_owner uuid;
  v_lancamento_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if p_conta_id is not null and not exists (
    select 1 from "ContaFinanceira" where id = p_conta_id and owner = v_owner
  ) then
    raise exception 'CONTA_INVALIDA' using errcode = 'P0001';
  end if;

  insert into "LancamentoFinanceiro" (data, descricao, valor, tipo, conta, owner)
  values (p_data, p_descricao, p_valor, 'Despesa', p_conta_id, v_owner)
  returning id into v_lancamento_id;

  return v_lancamento_id;
end;
$$;

revoke all on function public.agent_registrar_lancamento_despesa(text, text, numeric, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.agent_registrar_lancamento_despesa(text, text, numeric, date, bigint, bigint) to service_role;
