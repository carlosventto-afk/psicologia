-- supabase/migrations/20260904000004_add_agent_criar_conta_bancaria.sql
create or replace function public.agent_criar_conta_bancaria(
  p_whatsapp_number text,
  p_nome text,
  p_banco text,
  p_agencia text default null,
  p_numero text default null,
  p_tipo text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_proximo int;
  v_codigo text;
  v_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  if p_banco is null or btrim(p_banco) = '' then
    raise exception 'BANCO_OBRIGATORIO' using errcode = 'P0001';
  end if;

  select count(*) + 1 into v_proximo from "ContaFinanceira" where owner = v_owner;
  v_codigo := 'C' || lpad(v_proximo::text, 3, '0');

  insert into "ContaFinanceira" (codigo, nome, banco, agencia, numero, tipo, owner)
  values (
    v_codigo,
    btrim(p_nome),
    btrim(p_banco),
    nullif(btrim(p_agencia), ''),
    nullif(btrim(p_numero), ''),
    nullif(btrim(p_tipo), ''),
    v_owner
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.agent_criar_conta_bancaria(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_criar_conta_bancaria(text, text, text, text, text, text) to service_role;
