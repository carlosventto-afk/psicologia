-- Corrige _agent_resolve_consultorio: hoje ela nunca le agent_sessions,
-- entao todo profissional com mais de um consultorio seria interrompido
-- pra desambiguar EM TODA MENSAGEM. Agora, antes de levantar
-- CONSULTORIO_AMBIGUO, checa se ja existe uma escolha salva em
-- agent_sessions.consultorio_ativo_id (via agent_definir_consultorio_ativo,
-- criada nesta mesma migration) e reusa ela.
create or replace function public._agent_resolve_consultorio(
  p_whatsapp_number text,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count int;
  v_result bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_consultorio_id is not null then
    select id into v_result
    from "Consultorio"
    where id = p_consultorio_id and owner = v_owner;

    if v_result is null then
      raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
    end if;

    return v_result;
  end if;

  select count(*) into v_count from "Consultorio" where owner = v_owner;

  if v_count = 0 then
    raise exception 'SEM_CONSULTORIO_CADASTRADO' using errcode = 'P0001';
  elsif v_count = 1 then
    select id into v_result from "Consultorio" where owner = v_owner;
    return v_result;
  end if;

  -- multiplos consultorios: reusa a ultima escolha salva, se ainda valida
  select consultorio_ativo_id into v_result
  from agent_sessions
  where whatsapp_number = p_whatsapp_number;

  if v_result is not null and exists (
    select 1 from "Consultorio" where id = v_result and owner = v_owner
  ) then
    return v_result;
  end if;

  -- o n8n deve capturar essa excecao e chamar agent_listar_consultorios
  -- para o agente perguntar ao usuario, depois agent_definir_consultorio_ativo
  -- pra salvar a escolha antes de tentar de novo a tool original
  raise exception 'CONSULTORIO_AMBIGUO' using errcode = 'P0001';
end;
$$;

-- Tool nova: o agente chama depois de perguntar ao profissional qual
-- consultorio usar, quando _agent_resolve_consultorio levantou
-- CONSULTORIO_AMBIGUO.
create or replace function public.agent_definir_consultorio_ativo(
  p_whatsapp_number text,
  p_consultorio_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_usuario_id bigint;
  v_valido bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  select id into v_valido
  from "Consultorio"
  where id = p_consultorio_id and owner = v_owner;

  if v_valido is null then
    raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
  end if;

  select id into v_usuario_id from "Usuarios" where id_user = v_owner;

  insert into agent_sessions (whatsapp_number, usuario_id, consultorio_ativo_id, updated_at)
  values (p_whatsapp_number, v_usuario_id, p_consultorio_id, now())
  on conflict (whatsapp_number) do update set
    consultorio_ativo_id = excluded.consultorio_ativo_id,
    usuario_id = excluded.usuario_id,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.agent_definir_consultorio_ativo(text, bigint) from public, anon, authenticated;
grant execute on function public.agent_definir_consultorio_ativo(text, bigint) to service_role;
