-- Recria _agent_resolve_consultorio (foi removido em 20260827000002,
-- mas agent_criar_paciente precisa dela)
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

create or replace function public.agent_criar_paciente(
  p_whatsapp_number text,
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_valor_sessao numeric default null,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_consultorio_id bigint;
  v_paciente_id bigint;
  v_responsavel_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  insert into "Paciente" (nome, telefone, email, valor_sessao, consultorio, owner)
  values (
    btrim(p_nome),
    nullif(btrim(p_telefone), ''),
    nullif(btrim(p_email), ''),
    p_valor_sessao,
    v_consultorio_id,
    v_owner
  )
  returning id into v_paciente_id;

  -- Mesma cascata de criarPaciente (web/lib/actions/pacientes.js): todo
  -- paciente novo ganha um ResponsavelFinanceiro proprio ja vinculado.
  insert into "ResponsavelFinanceiro" (nome, paciente_vinculado, owner)
  values (btrim(p_nome), v_paciente_id, v_owner)
  returning id into v_responsavel_id;

  insert into "PacienteResponsavelFinanceiro" (paciente, responsavel, owner)
  values (v_paciente_id, v_responsavel_id, v_owner);

  return v_paciente_id;
end;
$$;

revoke all on function public._agent_resolve_consultorio(text, bigint) from public, anon, authenticated;
grant execute on function public._agent_resolve_consultorio(text, bigint) to service_role;

revoke all on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) from public, anon, authenticated;
grant execute on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) to service_role;
