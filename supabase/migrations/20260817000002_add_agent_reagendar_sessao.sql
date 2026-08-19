create or replace function public.agent_reagendar_sessao(
  p_whatsapp_number text,
  p_sessao_id bigint,
  p_data_nova date,
  p_horario_novo time,
  p_consultorio_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_paciente_id bigint;
  v_data_anterior date;
  v_horario_anterior time;
  v_reagendamentos_mes int;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select s.paciente, s.data, s.horario
    into v_paciente_id, v_data_anterior, v_horario_anterior
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.id = p_sessao_id
    and p.consultorio = v_consultorio_id
    and s."Realizado" = false
    and s.status is distinct from 'Cancelada';

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_REAGENDAVEL' using errcode = 'P0001';
  end if;

  update "Sessao"
  set data = p_data_nova, horario = p_horario_novo
  where id = p_sessao_id;

  insert into "SessaoReagendamento" (sessao, paciente, data_anterior, horario_anterior, data_nova, horario_novo)
  values (p_sessao_id, v_paciente_id, v_data_anterior, v_horario_anterior, p_data_nova, p_horario_novo);

  select count(*) into v_reagendamentos_mes
  from "SessaoReagendamento"
  where paciente = v_paciente_id
    and reagendado_em >= date_trunc('month', now())
    and reagendado_em < date_trunc('month', now()) + interval '1 month';

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'reagendamentos_mes_atual', v_reagendamentos_mes,
    'alerta', v_reagendamentos_mes >= 3
  );
end;
$$;

revoke all on function public.agent_reagendar_sessao(text, bigint, date, time, bigint) from public, anon, authenticated;
grant execute on function public.agent_reagendar_sessao(text, bigint, date, time, bigint) to service_role;
