-- Remove a recriação erronea de _agent_resolve_consultorio (que foi propositalmente
-- removida em 20260827000002 pois consultório era um recorte de UX, não a
-- barreira de segurança real — o agente agora escopeia só por owner)
drop function if exists public._agent_resolve_consultorio(text, bigint);

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

  if v_owner is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001';
  end if;

  if p_consultorio_id is not null then
    select id into v_consultorio_id
    from "Consultorio"
    where id = p_consultorio_id and owner = v_owner;

    if v_consultorio_id is null then
      raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
    end if;
  else
    select id into v_consultorio_id
    from "Consultorio"
    where owner = v_owner
    order by id
    limit 1;

    if v_consultorio_id is null then
      raise exception 'SEM_CONSULTORIO_CADASTRADO' using errcode = 'P0001';
    end if;
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

revoke all on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) from public, anon, authenticated;
grant execute on function public.agent_criar_paciente(text, text, text, text, numeric, bigint) to service_role;
