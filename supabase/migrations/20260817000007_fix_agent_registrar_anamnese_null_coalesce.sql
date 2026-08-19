-- Corrige agent_registrar_anamnese: quando uma chave em p_campos esta
-- presente com valor JSON null (ex: {"medicacao_em_uso": null}), o lado de
-- deteccao de diff (p_campos ? 'x' and ... is distinct from ...) ja tratava
-- isso corretamente como alteracao e registrava no AnamneseFollowup -- mas o
-- lado de persistencia usava coalesce(p_campos->>'x', v_atual.x), que nao
-- distingue "chave ausente" de "chave presente como null" (ambos colapsam
-- pro fallback do valor antigo). Resultado: o campo era reportado/logado
-- como alterado para null, mas o valor antigo permanecia gravado.
--
-- Fix: troca coalesce(...) por case when p_campos ? 'x' then p_campos->>'x'
-- else v_atual.x end, que usa o mesmo idioma de existencia de chave (?) que
-- o bloco de deteccao de diff ja usa -- so cai no valor antigo quando a
-- chave esta genuinamente ausente.
create or replace function public.agent_registrar_anamnese(
  p_whatsapp_number text,
  p_paciente_id bigint,
  p_campos jsonb default '{}'::jsonb,
  p_observacao text default null,
  p_consultorio_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_paciente_ok bigint;
  v_atual "Anamnese";
  v_anamnese_id bigint;
  v_alteracoes jsonb := '[]'::jsonb;
  v_chave text;
  v_campos_validos text[] := array[
    'medicacao_em_uso','medico_responsavel','terapia_desde','atendido_desde',
    'queixa_inicial','desenvolvimento_queixa','historico_familiar',
    'tratamento_anterior','uso_substancias','hipotese_diagnostica','expectativas'
  ];
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select id into v_paciente_ok
  from "Paciente"
  where id = p_paciente_id and consultorio = v_consultorio_id;

  if v_paciente_ok is null then
    raise exception 'PACIENTE_INVALIDO' using errcode = 'P0001';
  end if;

  for v_chave in select jsonb_object_keys(p_campos) loop
    if not (v_chave = any(v_campos_validos)) then
      raise exception 'CAMPO_ANAMNESE_INVALIDO' using errcode = 'P0001';
    end if;
  end loop;

  select * into v_atual from "Anamnese" where paciente = p_paciente_id;

  if p_campos ? 'medicacao_em_uso' and v_atual.medicacao_em_uso is distinct from p_campos->>'medicacao_em_uso' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'medicacao_em_uso', 'valor_anterior', v_atual.medicacao_em_uso, 'valor_novo', p_campos->>'medicacao_em_uso');
  end if;
  if p_campos ? 'medico_responsavel' and v_atual.medico_responsavel is distinct from p_campos->>'medico_responsavel' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'medico_responsavel', 'valor_anterior', v_atual.medico_responsavel, 'valor_novo', p_campos->>'medico_responsavel');
  end if;
  if p_campos ? 'terapia_desde' and v_atual.terapia_desde is distinct from p_campos->>'terapia_desde' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'terapia_desde', 'valor_anterior', v_atual.terapia_desde, 'valor_novo', p_campos->>'terapia_desde');
  end if;
  if p_campos ? 'atendido_desde' and v_atual.atendido_desde is distinct from p_campos->>'atendido_desde' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'atendido_desde', 'valor_anterior', v_atual.atendido_desde, 'valor_novo', p_campos->>'atendido_desde');
  end if;
  if p_campos ? 'queixa_inicial' and v_atual.queixa_inicial is distinct from p_campos->>'queixa_inicial' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'queixa_inicial', 'valor_anterior', v_atual.queixa_inicial, 'valor_novo', p_campos->>'queixa_inicial');
  end if;
  if p_campos ? 'desenvolvimento_queixa' and v_atual.desenvolvimento_queixa is distinct from p_campos->>'desenvolvimento_queixa' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'desenvolvimento_queixa', 'valor_anterior', v_atual.desenvolvimento_queixa, 'valor_novo', p_campos->>'desenvolvimento_queixa');
  end if;
  if p_campos ? 'historico_familiar' and v_atual.historico_familiar is distinct from p_campos->>'historico_familiar' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'historico_familiar', 'valor_anterior', v_atual.historico_familiar, 'valor_novo', p_campos->>'historico_familiar');
  end if;
  if p_campos ? 'tratamento_anterior' and v_atual.tratamento_anterior is distinct from p_campos->>'tratamento_anterior' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'tratamento_anterior', 'valor_anterior', v_atual.tratamento_anterior, 'valor_novo', p_campos->>'tratamento_anterior');
  end if;
  if p_campos ? 'uso_substancias' and v_atual.uso_substancias is distinct from p_campos->>'uso_substancias' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'uso_substancias', 'valor_anterior', v_atual.uso_substancias, 'valor_novo', p_campos->>'uso_substancias');
  end if;
  if p_campos ? 'hipotese_diagnostica' and v_atual.hipotese_diagnostica is distinct from p_campos->>'hipotese_diagnostica' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'hipotese_diagnostica', 'valor_anterior', v_atual.hipotese_diagnostica, 'valor_novo', p_campos->>'hipotese_diagnostica');
  end if;
  if p_campos ? 'expectativas' and v_atual.expectativas is distinct from p_campos->>'expectativas' then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'expectativas', 'valor_anterior', v_atual.expectativas, 'valor_novo', p_campos->>'expectativas');
  end if;

  insert into "Anamnese" (
    paciente, medicacao_em_uso, medico_responsavel, terapia_desde, atendido_desde,
    queixa_inicial, desenvolvimento_queixa, historico_familiar, tratamento_anterior,
    uso_substancias, hipotese_diagnostica, expectativas, atualizado_em
  )
  values (
    p_paciente_id,
    case when p_campos ? 'medicacao_em_uso' then p_campos->>'medicacao_em_uso' else v_atual.medicacao_em_uso end,
    case when p_campos ? 'medico_responsavel' then p_campos->>'medico_responsavel' else v_atual.medico_responsavel end,
    case when p_campos ? 'terapia_desde' then p_campos->>'terapia_desde' else v_atual.terapia_desde end,
    case when p_campos ? 'atendido_desde' then p_campos->>'atendido_desde' else v_atual.atendido_desde end,
    case when p_campos ? 'queixa_inicial' then p_campos->>'queixa_inicial' else v_atual.queixa_inicial end,
    case when p_campos ? 'desenvolvimento_queixa' then p_campos->>'desenvolvimento_queixa' else v_atual.desenvolvimento_queixa end,
    case when p_campos ? 'historico_familiar' then p_campos->>'historico_familiar' else v_atual.historico_familiar end,
    case when p_campos ? 'tratamento_anterior' then p_campos->>'tratamento_anterior' else v_atual.tratamento_anterior end,
    case when p_campos ? 'uso_substancias' then p_campos->>'uso_substancias' else v_atual.uso_substancias end,
    case when p_campos ? 'hipotese_diagnostica' then p_campos->>'hipotese_diagnostica' else v_atual.hipotese_diagnostica end,
    case when p_campos ? 'expectativas' then p_campos->>'expectativas' else v_atual.expectativas end,
    now()
  )
  on conflict (paciente) do update set
    medicacao_em_uso = excluded.medicacao_em_uso,
    medico_responsavel = excluded.medico_responsavel,
    terapia_desde = excluded.terapia_desde,
    atendido_desde = excluded.atendido_desde,
    queixa_inicial = excluded.queixa_inicial,
    desenvolvimento_queixa = excluded.desenvolvimento_queixa,
    historico_familiar = excluded.historico_familiar,
    tratamento_anterior = excluded.tratamento_anterior,
    uso_substancias = excluded.uso_substancias,
    hipotese_diagnostica = excluded.hipotese_diagnostica,
    expectativas = excluded.expectativas,
    atualizado_em = excluded.atualizado_em
  returning id into v_anamnese_id;

  if jsonb_array_length(v_alteracoes) > 0 or p_observacao is not null then
    insert into "AnamneseFollowup" (anamnese, observacao, alteracoes)
    values (v_anamnese_id, p_observacao, v_alteracoes);
  end if;

  return jsonb_build_object('anamnese_id', v_anamnese_id, 'alteracoes', v_alteracoes);
end;
$$;

revoke all on function public.agent_registrar_anamnese(text, bigint, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.agent_registrar_anamnese(text, bigint, jsonb, text, bigint) to service_role;
