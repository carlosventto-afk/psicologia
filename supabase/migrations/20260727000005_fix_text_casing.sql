-- Migration: corrige literais de texto que não batem com a convenção real
-- do banco (descoberta ao inspecionar dados existentes ao construir a Fase 4
-- do app Next.js): LancamentoFinanceiro.tipo usa 'Receita'/'Despesa'
-- (capitalizado), TipoAtendimento.Nome usa 'Avulso'/'Semanal'/... capitalizado,
-- não 'receita'/'avulso' como as funções abaixo escreviam.
--
-- Sem essa correção, pagamentos registrados pelo agente de WhatsApp via
-- agent_registrar_pagamento_sessao ficariam de fora do resumo financeiro
-- (a view v_resumo_financeiro_mensal soma por tipo = 'Receita' exato), e
-- sessões marcadas/realizadas/canceladas pelo agente ficariam com status
-- em um "dialeto" diferente do usado pelo app Next.js.

create or replace function public.agent_registrar_pagamento_sessao(
  p_whatsapp_number text,
  p_sessao_id bigint,
  p_valor numeric,
  p_forma_pagamento text,
  p_conta_id bigint,
  p_consultorio_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_owner uuid;
  v_sessao_ok bigint;
  v_lancamento_id bigint;
  v_pagamento_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.id into v_sessao_ok
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.id = p_sessao_id and p.consultorio = v_consultorio_id;

  if v_sessao_ok is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into "LancamentoFinanceiro" (data, descricao, valor, tipo, conta, sessao, owner)
  values (current_date, 'Pagamento de sessão', p_valor, 'Receita', p_conta_id, p_sessao_id, v_owner)
  returning id into v_lancamento_id;

  insert into "PagamentoSessao" (sessao, valor, data_pagamento, forma_pagamento, conta, lancamento)
  values (p_sessao_id, p_valor, current_date, p_forma_pagamento, p_conta_id, v_lancamento_id)
  returning id into v_pagamento_id;

  update "Sessao"
  set status = 'Realizada', "Realizado" = true
  where id = p_sessao_id;

  return jsonb_build_object('pagamento_id', v_pagamento_id, 'lancamento_id', v_lancamento_id);
end;
$$;

create or replace function public.agent_marcar_atendimento_realizado(
  p_whatsapp_number text,
  p_sessao_id bigint,
  p_anotacoes text default null,
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

  update "Sessao" s
  set status = 'Realizada',
      "Realizado" = true,
      anotacoes = coalesce(p_anotacoes, s.anotacoes)
  where s.id = p_sessao_id
    and exists (
      select 1 from "Paciente" p
      where p.id = s.paciente and p.consultorio = v_consultorio_id
    );

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

create or replace function public.agent_agendar_sessao_avulsa(
  p_whatsapp_number text,
  p_paciente_id bigint,
  p_data date,
  p_horario time,
  p_duracao_min numeric default 50,
  p_consultorio_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
  v_owner uuid;
  v_paciente_ok bigint;
  v_sessao_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select id into v_paciente_ok
  from "Paciente"
  where id = p_paciente_id and consultorio = v_consultorio_id;

  if v_paciente_ok is null then
    raise exception 'PACIENTE_INVALIDO' using errcode = 'P0001';
  end if;

  insert into "Sessao" (paciente, data, horario, duracao_min, tipo_sessao, status, owner, "Realizado")
  values (p_paciente_id, p_data, p_horario, p_duracao_min, 'Avulso', 'Marcada', v_owner, false)
  returning id into v_sessao_id;

  return v_sessao_id;
end;
$$;

create or replace function public.agent_cancelar_sessao(
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

  update "Sessao" s
  set status = 'Cancelada'
  where s.id = p_sessao_id
    and exists (
      select 1 from "Paciente" p
      where p.id = s.paciente and p.consultorio = v_consultorio_id
    );

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
end;
$$;
