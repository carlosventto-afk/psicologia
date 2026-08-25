-- Fix search_path: use schema-qualified gen_random_bytes instead of widening search_path
create or replace function public.gerar_link_completar_cadastro(p_paciente_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from "Paciente" p
    where p.id = p_paciente_id and (p.owner = auth.uid() or public.is_admin())
  ) then
    raise exception 'PACIENTE_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  -- invalida qualquer link anterior ainda ativo do mesmo paciente -- so o
  -- mais recente funciona.
  update "TokenCompletarCadastro"
  set expira_em = now()
  where paciente_id = p_paciente_id
    and usado_em is null
    and expira_em > now();

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into "TokenCompletarCadastro" (paciente_id, token, expira_em)
  values (p_paciente_id, v_token, now() + interval '7 days');

  return v_token;
end;
$$;
