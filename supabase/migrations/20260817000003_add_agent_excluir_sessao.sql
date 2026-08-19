create or replace function public.agent_excluir_sessao(
  p_whatsapp_number text,
  p_sessao_id bigint,
  p_consultorio_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  delete from "Sessao" s
  where s.id = p_sessao_id
    and exists (
      select 1 from "Paciente" p
      where p.id = s.paciente and p.consultorio = v_consultorio_id
    );

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
exception
  when foreign_key_violation then
    raise exception 'SESSAO_TEM_VINCULO_FINANCEIRO' using errcode = 'P0001';
end;
$$;

revoke all on function public.agent_excluir_sessao(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.agent_excluir_sessao(text, bigint, bigint) to service_role;
