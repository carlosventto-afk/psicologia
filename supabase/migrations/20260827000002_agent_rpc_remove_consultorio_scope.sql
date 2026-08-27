-- supabase/migrations/20260827000002_agent_rpc_remove_consultorio_scope.sql
-- Remove o escopo por "consultorio ativo da conversa" de todas as RPCs do
-- agente de WhatsApp. `owner` (ja existente em Paciente/Sessao/etc, usado
-- pelo RLS) sempre foi a barreira de seguranca real -- o filtro por
-- consultorio nunca foi isso, so um recorte de UX. Mesma assinatura em
-- toda funcao (mantem p_consultorio_id no parametro, so nao usa mais no
-- corpo) para nao precisar de DROP FUNCTION + regrant.
--
-- Nota: alem das 15 funcoes originalmente listadas no plano, esta migration
-- tambem reescreve agent_status_pagamento_paciente, que dependia da mesma
-- _agent_resolve_consultorio e ficaria quebrada (chamando funcao inexistente)
-- apos o DROP FUNCTION abaixo. Gap identificado durante o cross-check contra
-- o estado ao vivo do banco antes de aplicar a migration.

CREATE OR REPLACE FUNCTION public.agent_agendar_sessao_avulsa(p_whatsapp_number text, p_paciente_id bigint, p_data date, p_horario time without time zone, p_duracao_min numeric DEFAULT 50, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_paciente_ok bigint;
  v_sessao_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select id into v_paciente_ok
  from "Paciente"
  where id = p_paciente_id and owner = v_owner;

  if v_paciente_ok is null then
    raise exception 'PACIENTE_INVALIDO' using errcode = 'P0001';
  end if;

  insert into "Sessao" (paciente, data, horario, duracao_min, tipo_sessao, status, owner, "Realizado")
  values (p_paciente_id, p_data, p_horario, p_duracao_min, 'avulso', 'marcada', v_owner, false)
  returning id into v_sessao_id;

  return v_sessao_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_buscar_paciente(p_whatsapp_number text, p_nome text, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(id bigint, nome text, similaridade real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select p.id, p.nome, similarity(p.nome, p_nome) as similaridade
  from "Paciente" p
  where p.owner = v_owner
    and similarity(p.nome, p_nome) > 0.3
  order by similaridade desc
  limit 5;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_cancelar_sessao(p_whatsapp_number text, p_sessao_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  update "Sessao" s
  set status = 'cancelada'
  where s.id = p_sessao_id
    and s.owner = v_owner;

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_excluir_pagamento(p_whatsapp_number text, p_pagamento_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_pagamento_id bigint;
  v_lancamento_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select pg.id, pg.lancamento into v_pagamento_id, v_lancamento_id
  from "PagamentoSessao" pg
  join "Sessao" s on s.id = pg.sessao
  where pg.id = p_pagamento_id and s.owner = v_owner;

  if v_pagamento_id is null then
    raise exception 'PAGAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  delete from "PagamentoSessao" where id = v_pagamento_id;

  if v_lancamento_id is not null then
    delete from "LancamentoFinanceiro" where id = v_lancamento_id;
  end if;

  return true;
exception
  when foreign_key_violation then
    raise exception 'PAGAMENTO_TEM_NOTA_FISCAL' using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_excluir_sessao(p_whatsapp_number text, p_sessao_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  delete from "Sessao" s
  where s.id = p_sessao_id
    and s.owner = v_owner;

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
exception
  when foreign_key_violation then
    raise exception 'SESSAO_TEM_VINCULO_FINANCEIRO' using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_gerar_recibo(p_whatsapp_number text, p_sessao_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_paciente_id bigint;
  v_consultorio_id bigint;
  v_recibo_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.paciente, p.consultorio into v_paciente_id, v_consultorio_id
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.id = p_sessao_id and s.owner = v_owner;

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into "Recibo" (sessao, consultorio, paciente, data_emissao, owner)
  values (p_sessao_id, v_consultorio_id, v_paciente_id, current_date, v_owner)
  returning id into v_recibo_id;

  return v_recibo_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_get_agenda(p_whatsapp_number text, p_data_inicio date, p_data_fim date, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sessao_id bigint, paciente_nome text, data date, horario time without time zone, duracao_min numeric, status text, realizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select s.id, p.nome, s.data, s.horario, s.duracao_min, s.status, s."Realizado"
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.owner = v_owner
    and s.data between p_data_inicio and p_data_fim
  order by s.data, s.horario;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_listar_debitos_paciente(p_whatsapp_number text, p_paciente_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sessao_id bigint, data date, valor_devido real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select s.id, s.data, coalesce(pac.valor_sessao, 0)
  from "Sessao" s
  join "Paciente" pac on pac.id = s.paciente
  left join "PagamentoSessao" pg on pg.sessao = s.id
  where s.owner = v_owner
    and s.paciente = p_paciente_id
    and s."Realizado" = true
    and pg.id is null
  order by s.data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_listar_inadimplentes(p_whatsapp_number text, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(paciente_id bigint, paciente_nome text, sessao_id bigint, data date, valor_devido real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select p.id, p.nome, s.id, s.data, coalesce(p.valor_sessao, 0)
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  left join "PagamentoSessao" pg on pg.sessao = s.id
  where s.owner = v_owner
    and s."Realizado" = true
    and pg.id is null
  order by s.data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_marcar_atendimento_realizado(p_whatsapp_number text, p_sessao_id bigint, p_anotacoes text DEFAULT NULL::text, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  update "Sessao" s
  set status = 'realizada',
      "Realizado" = true,
      anotacoes = coalesce(p_anotacoes, s.anotacoes)
  where s.id = p_sessao_id
    and s.owner = v_owner;

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_reagendar_sessao(p_whatsapp_number text, p_sessao_id bigint, p_data_nova date, p_horario_novo time without time zone, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_paciente_id bigint;
  v_data_anterior date;
  v_horario_anterior time;
  v_reagendamentos_mes int;
  v_inicio_mes timestamptz;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.paciente, s.data, s.horario
    into v_paciente_id, v_data_anterior, v_horario_anterior
  from "Sessao" s
  where s.id = p_sessao_id
    and s.owner = v_owner
    and coalesce(s."Realizado", false) = false
    and s.status is distinct from 'Cancelada';

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_REAGENDAVEL' using errcode = 'P0001';
  end if;

  update "Sessao"
  set data = p_data_nova, horario = p_horario_novo
  where id = p_sessao_id;

  insert into "SessaoReagendamento" (sessao, paciente, data_anterior, horario_anterior, data_nova, horario_novo)
  values (p_sessao_id, v_paciente_id, v_data_anterior, v_horario_anterior, p_data_nova, p_horario_novo);

  v_inicio_mes := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';

  select count(*) into v_reagendamentos_mes
  from "SessaoReagendamento"
  where paciente = v_paciente_id
    and reagendado_em >= v_inicio_mes
    and reagendado_em < v_inicio_mes + interval '1 month';

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'reagendamentos_mes_atual', v_reagendamentos_mes,
    'alerta', v_reagendamentos_mes >= 3
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_registrar_anamnese(p_whatsapp_number text, p_paciente_id bigint, p_campos jsonb DEFAULT '{}'::jsonb, p_observacao text DEFAULT NULL::text, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
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
  p_campos := coalesce(p_campos, '{}'::jsonb);
  if jsonb_typeof(p_campos) <> 'object' then
    raise exception 'CAMPOS_INVALIDOS' using errcode = 'P0001';
  end if;

  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select id into v_paciente_ok
  from "Paciente"
  where id = p_paciente_id and owner = v_owner;

  if v_paciente_ok is null then
    raise exception 'PACIENTE_INVALIDO' using errcode = 'P0001';
  end if;

  for v_chave in select jsonb_object_keys(p_campos) loop
    if not (v_chave = any(v_campos_validos)) then
      raise exception 'CAMPO_ANAMNESE_INVALIDO' using errcode = 'P0001';
    end if;
  end loop;

  select * into v_atual from "Anamnese" where paciente = p_paciente_id;

  if p_campos ? 'medicacao_em_uso' and v_atual.medicacao_em_uso is distinct from nullif(trim(p_campos->>'medicacao_em_uso'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'medicacao_em_uso', 'valor_anterior', v_atual.medicacao_em_uso, 'valor_novo', nullif(trim(p_campos->>'medicacao_em_uso'), ''));
  end if;
  if p_campos ? 'medico_responsavel' and v_atual.medico_responsavel is distinct from nullif(trim(p_campos->>'medico_responsavel'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'medico_responsavel', 'valor_anterior', v_atual.medico_responsavel, 'valor_novo', nullif(trim(p_campos->>'medico_responsavel'), ''));
  end if;
  if p_campos ? 'terapia_desde' and v_atual.terapia_desde is distinct from nullif(trim(p_campos->>'terapia_desde'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'terapia_desde', 'valor_anterior', v_atual.terapia_desde, 'valor_novo', nullif(trim(p_campos->>'terapia_desde'), ''));
  end if;
  if p_campos ? 'atendido_desde' and v_atual.atendido_desde is distinct from nullif(trim(p_campos->>'atendido_desde'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'atendido_desde', 'valor_anterior', v_atual.atendido_desde, 'valor_novo', nullif(trim(p_campos->>'atendido_desde'), ''));
  end if;
  if p_campos ? 'queixa_inicial' and v_atual.queixa_inicial is distinct from nullif(trim(p_campos->>'queixa_inicial'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'queixa_inicial', 'valor_anterior', v_atual.queixa_inicial, 'valor_novo', nullif(trim(p_campos->>'queixa_inicial'), ''));
  end if;
  if p_campos ? 'desenvolvimento_queixa' and v_atual.desenvolvimento_queixa is distinct from nullif(trim(p_campos->>'desenvolvimento_queixa'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'desenvolvimento_queixa', 'valor_anterior', v_atual.desenvolvimento_queixa, 'valor_novo', nullif(trim(p_campos->>'desenvolvimento_queixa'), ''));
  end if;
  if p_campos ? 'historico_familiar' and v_atual.historico_familiar is distinct from nullif(trim(p_campos->>'historico_familiar'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'historico_familiar', 'valor_anterior', v_atual.historico_familiar, 'valor_novo', nullif(trim(p_campos->>'historico_familiar'), ''));
  end if;
  if p_campos ? 'tratamento_anterior' and v_atual.tratamento_anterior is distinct from nullif(trim(p_campos->>'tratamento_anterior'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'tratamento_anterior', 'valor_anterior', v_atual.tratamento_anterior, 'valor_novo', nullif(trim(p_campos->>'tratamento_anterior'), ''));
  end if;
  if p_campos ? 'uso_substancias' and v_atual.uso_substancias is distinct from nullif(trim(p_campos->>'uso_substancias'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'uso_substancias', 'valor_anterior', v_atual.uso_substancias, 'valor_novo', nullif(trim(p_campos->>'uso_substancias'), ''));
  end if;
  if p_campos ? 'hipotese_diagnostica' and v_atual.hipotese_diagnostica is distinct from nullif(trim(p_campos->>'hipotese_diagnostica'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'hipotese_diagnostica', 'valor_anterior', v_atual.hipotese_diagnostica, 'valor_novo', nullif(trim(p_campos->>'hipotese_diagnostica'), ''));
  end if;
  if p_campos ? 'expectativas' and v_atual.expectativas is distinct from nullif(trim(p_campos->>'expectativas'), '') then
    v_alteracoes := v_alteracoes || jsonb_build_object('campo', 'expectativas', 'valor_anterior', v_atual.expectativas, 'valor_novo', nullif(trim(p_campos->>'expectativas'), ''));
  end if;

  if v_atual.id is null and jsonb_array_length(v_alteracoes) = 0 and p_observacao is null then
    return jsonb_build_object('anamnese_id', null, 'alteracoes', '[]'::jsonb);
  end if;

  insert into "Anamnese" (
    paciente, medicacao_em_uso, medico_responsavel, terapia_desde, atendido_desde,
    queixa_inicial, desenvolvimento_queixa, historico_familiar, tratamento_anterior,
    uso_substancias, hipotese_diagnostica, expectativas, atualizado_em
  )
  values (
    p_paciente_id,
    case when p_campos ? 'medicacao_em_uso' then nullif(trim(p_campos->>'medicacao_em_uso'), '') else v_atual.medicacao_em_uso end,
    case when p_campos ? 'medico_responsavel' then nullif(trim(p_campos->>'medico_responsavel'), '') else v_atual.medico_responsavel end,
    case when p_campos ? 'terapia_desde' then nullif(trim(p_campos->>'terapia_desde'), '') else v_atual.terapia_desde end,
    case when p_campos ? 'atendido_desde' then nullif(trim(p_campos->>'atendido_desde'), '') else v_atual.atendido_desde end,
    case when p_campos ? 'queixa_inicial' then nullif(trim(p_campos->>'queixa_inicial'), '') else v_atual.queixa_inicial end,
    case when p_campos ? 'desenvolvimento_queixa' then nullif(trim(p_campos->>'desenvolvimento_queixa'), '') else v_atual.desenvolvimento_queixa end,
    case when p_campos ? 'historico_familiar' then nullif(trim(p_campos->>'historico_familiar'), '') else v_atual.historico_familiar end,
    case when p_campos ? 'tratamento_anterior' then nullif(trim(p_campos->>'tratamento_anterior'), '') else v_atual.tratamento_anterior end,
    case when p_campos ? 'uso_substancias' then nullif(trim(p_campos->>'uso_substancias'), '') else v_atual.uso_substancias end,
    case when p_campos ? 'hipotese_diagnostica' then nullif(trim(p_campos->>'hipotese_diagnostica'), '') else v_atual.hipotese_diagnostica end,
    case when p_campos ? 'expectativas' then nullif(trim(p_campos->>'expectativas'), '') else v_atual.expectativas end,
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
$function$;

CREATE OR REPLACE FUNCTION public.agent_registrar_lancamento_despesa(p_whatsapp_number text, p_descricao text, p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_conta_id bigint DEFAULT NULL::bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_lancamento_id bigint;
begin
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
$function$;

CREATE OR REPLACE FUNCTION public.agent_registrar_pagamento_sessao(p_whatsapp_number text, p_sessao_id bigint, p_valor numeric, p_forma_pagamento text, p_conta_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_sessao_ok bigint;
  v_lancamento_id bigint;
  v_pagamento_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.id into v_sessao_ok
  from "Sessao" s
  where s.id = p_sessao_id and s.owner = v_owner;

  if v_sessao_ok is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into "LancamentoFinanceiro" (data, descricao, valor, tipo, conta, sessao, owner)
  values (current_date, 'Pagamento de sessão', p_valor, 'receita', p_conta_id, p_sessao_id, v_owner)
  returning id into v_lancamento_id;

  insert into "PagamentoSessao" (sessao, valor, data_pagamento, forma_pagamento, conta, lancamento)
  values (p_sessao_id, p_valor, current_date, p_forma_pagamento, p_conta_id, v_lancamento_id)
  returning id into v_pagamento_id;

  update "Sessao"
  set status = 'realizada', "Realizado" = true
  where id = p_sessao_id;

  return jsonb_build_object('pagamento_id', v_pagamento_id, 'lancamento_id', v_lancamento_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_resumo_financeiro(p_whatsapp_number text, p_data_inicio date, p_data_fim date, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_previsto numeric;
  v_realizado numeric;
  v_despesas numeric;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select coalesce(sum(p.valor_sessao), 0) into v_previsto
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.owner = v_owner
    and s.data between p_data_inicio and p_data_fim;

  select coalesce(sum(total_receita), 0), coalesce(sum(total_despesa), 0)
  into v_realizado, v_despesas
  from v_resumo_financeiro_mensal
  where owner = v_owner
    and to_date(mes_referencia, 'YYYY-MM') between date_trunc('month', p_data_inicio) and date_trunc('month', p_data_fim);

  return jsonb_build_object(
    'previsto', v_previsto,
    'realizado', v_realizado,
    'despesas', v_despesas,
    'saldo', v_realizado - v_despesas
  );
end;
$function$;

-- 16a funcao: nao estava na lista original do plano, mas depende da mesma
-- _agent_resolve_consultorio e quebraria (chamando funcao inexistente) apos
-- o DROP FUNCTION abaixo. Gap identificado no cross-check contra o estado
-- ao vivo do banco antes de aplicar esta migration; corrigido no mesmo
-- padrao owner-scoped das demais 15.
CREATE OR REPLACE FUNCTION public.agent_status_pagamento_paciente(p_whatsapp_number text, p_paciente_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sessao_id bigint, data date, valor_sessao real, pago boolean, valor_pago real, forma_pagamento text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select
    s.id,
    s.data,
    coalesce(pac.valor_sessao, 0),
    (pg.id is not null) as pago,
    pg.valor,
    pg.forma_pagamento
  from "Sessao" s
  join "Paciente" pac on pac.id = s.paciente
  left join "PagamentoSessao" pg on pg.sessao = s.id
  where s.owner = v_owner
    and s.paciente = p_paciente_id
  order by s.data desc
  limit 20;
end;
$function$;

-- Remocao das funcoes/coluna que ficam sem nenhum chamador apos a mudanca
-- acima.
DROP FUNCTION IF EXISTS public.agent_definir_consultorio_ativo(text, bigint);
DROP FUNCTION IF EXISTS public.agent_listar_consultorios(text);
DROP FUNCTION IF EXISTS public._agent_resolve_consultorio(text, bigint);

ALTER TABLE agent_sessions DROP COLUMN IF EXISTS consultorio_ativo_id;
