create or replace function public.agent_criar_consultorio(
  p_whatsapp_number text,
  p_nome text,
  p_telefone text default null,
  p_email_atendimento text default null,
  p_endereco text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario record;
  v_id bigint;
begin
  select id, id_user, contato, email into v_usuario
  from "Usuarios"
  where whatsapp_number = p_whatsapp_number and whatsapp_verified = true;

  if v_usuario.id_user is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  insert into "Consultorio" (nome, telefone, email_atendimento, endereco, owner)
  values (
    btrim(p_nome),
    coalesce(nullif(btrim(p_telefone), ''), v_usuario.contato::text),
    coalesce(nullif(btrim(p_email_atendimento), ''), v_usuario.email),
    nullif(btrim(p_endereco), ''),
    v_usuario.id_user
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.agent_criar_consultorio(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_criar_consultorio(text, text, text, text, text) to service_role;
