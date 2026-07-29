-- Migration: RPC functions (tools) do agente de WhatsApp
-- Baseado no schema REAL (bigint ids, tabelas PascalCase, ownership via
-- coluna "owner" uuid = auth.uid()). Todas security definer; resolvem
-- consultorio internamente a partir do whatsapp_number verificado.
-- Chamadas apenas pelo n8n com a service_role key (GRANTs no final do arquivo).

-- ============================================================
-- Helpers internos (prefixo _agent_) — não expor como tool de negócio
-- ============================================================

create or replace function public._agent_get_owner_uuid(p_whatsapp_number text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id_user from "Usuarios"
  where whatsapp_number = p_whatsapp_number and whatsapp_verified = true
  limit 1;
$$;

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
  elsif v_count > 1 then
    -- o n8n deve capturar essa exceção e chamar agent_listar_consultorios
    -- para o agente perguntar qual consultório ao usuário
    raise exception 'CONSULTORIO_AMBIGUO' using errcode = 'P0001';
  end if;

  select id into v_result from "Consultorio" where owner = v_owner;
  return v_result;
end;
$$;

-- ============================================================
-- Tool: desambiguação de consultório (usada quando há mais de um)
-- ============================================================

create or replace function public.agent_listar_consultorios(p_whatsapp_number text)
returns table (id bigint, nome text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome
  from "Consultorio" c
  join "Usuarios" u on u.id_user = c.owner
  where u.whatsapp_number = p_whatsapp_number and u.whatsapp_verified = true
  order by c.nome;
$$;

-- ============================================================
-- Tool: busca fuzzy de paciente por nome (escopada ao consultório resolvido)
-- ============================================================

create or replace function public.agent_buscar_paciente(
  p_whatsapp_number text,
  p_nome text,
  p_consultorio_id bigint default null
)
returns table (id bigint, nome text, similaridade real)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select p.id, p.nome, similarity(p.nome, p_nome) as similaridade
  from "Paciente" p
  where p.consultorio = v_consultorio_id
    and similarity(p.nome, p_nome) > 0.3
  order by similaridade desc
  limit 5;
end;
$$;

-- ============================================================
-- Tool: agenda por período (dia/semana/mês = mesmo range de datas)
-- ============================================================

create or replace function public.agent_get_agenda(
  p_whatsapp_number text,
  p_data_inicio date,
  p_data_fim date,
  p_consultorio_id bigint default null
)
returns table (
  sessao_id bigint,
  paciente_nome text,
  data date,
  horario time,
  duracao_min numeric,
  status text,
  realizado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select s.id, p.nome, s.data, s.horario, s.duracao_min, s.status, s."Realizado"
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where p.consultorio = v_consultorio_id
    and s.data between p_data_inicio and p_data_fim
  order by s.data, s.horario;
end;
$$;

-- ============================================================
-- Tool: status de pagamento das últimas sessões de um paciente
-- ============================================================

create or replace function public.agent_status_pagamento_paciente(
  p_whatsapp_number text,
  p_paciente_id bigint,
  p_consultorio_id bigint default null
)
returns table (
  sessao_id bigint,
  data date,
  valor_sessao real,
  pago boolean,
  valor_pago real,
  forma_pagamento text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

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
  where pac.consultorio = v_consultorio_id
    and s.paciente = p_paciente_id
  order by s.data desc
  limit 20;
end;
$$;

-- ============================================================
-- Tool: débitos de um paciente (sessões realizadas sem pagamento vinculado)
-- ============================================================

create or replace function public.agent_listar_debitos_paciente(
  p_whatsapp_number text,
  p_paciente_id bigint,
  p_consultorio_id bigint default null
)
returns table (sessao_id bigint, data date, valor_devido real)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select s.id, s.data, coalesce(pac.valor_sessao, 0)
  from "Sessao" s
  join "Paciente" pac on pac.id = s.paciente
  left join "PagamentoSessao" pg on pg.sessao = s.id
  where pac.consultorio = v_consultorio_id
    and s.paciente = p_paciente_id
    and s."Realizado" = true
    and pg.id is null
  order by s.data;
end;
$$;

-- ============================================================
-- Tool: registrar pagamento de sessão (grava pagamento + lançamento)
-- ============================================================

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
$$;

-- ============================================================
-- Tool: marcar atendimento como realizado
-- ============================================================

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
  set status = 'realizada',
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

-- ============================================================
-- Tool: agendar sessão avulsa
-- ============================================================

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
  values (p_paciente_id, p_data, p_horario, p_duracao_min, 'avulso', 'marcada', v_owner, false)
  returning id into v_sessao_id;

  return v_sessao_id;
end;
$$;

-- ============================================================
-- Tool: cancelar sessão
-- ============================================================

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
  set status = 'cancelada'
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

-- ============================================================
-- Tool: gerar recibo simples (usa a tabela "Recibo" criada na migration anterior)
-- ============================================================

create or replace function public.agent_gerar_recibo(
  p_whatsapp_number text,
  p_sessao_id bigint,
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
  v_paciente_id bigint;
  v_recibo_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.paciente into v_paciente_id
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where s.id = p_sessao_id and p.consultorio = v_consultorio_id;

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into "Recibo" (sessao, consultorio, paciente, data_emissao, owner)
  values (p_sessao_id, v_consultorio_id, v_paciente_id, current_date, v_owner)
  returning id into v_recibo_id;

  return v_recibo_id;
end;
$$;

-- ============================================================
-- Tool: listar inadimplentes (sessões realizadas sem pagamento)
-- ============================================================

create or replace function public.agent_listar_inadimplentes(
  p_whatsapp_number text,
  p_consultorio_id bigint default null
)
returns table (
  paciente_id bigint,
  paciente_nome text,
  sessao_id bigint,
  data date,
  valor_devido real
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id bigint;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select p.id, p.nome, s.id, s.data, coalesce(p.valor_sessao, 0)
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  left join "PagamentoSessao" pg on pg.sessao = s.id
  where p.consultorio = v_consultorio_id
    and s."Realizado" = true
    and pg.id is null
  order by s.data;
end;
$$;

-- ============================================================
-- Tool: resumo financeiro (previsto x realizado)
-- Reaproveita a view existente v_resumo_financeiro_mensal para
-- realizado/despesas/saldo, e calcula "previsto" a partir da agenda.
-- ============================================================

create or replace function public.agent_resumo_financeiro(
  p_whatsapp_number text,
  p_data_inicio date,
  p_data_fim date,
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
  v_previsto numeric;
  v_realizado numeric;
  v_despesas numeric;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select coalesce(sum(p.valor_sessao), 0) into v_previsto
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  where p.consultorio = v_consultorio_id
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
$$;

-- ============================================================
-- Permissões: só a service_role (usada pelo n8n) pode chamar essas funções.
-- ============================================================

revoke all on function public._agent_get_owner_uuid(text) from public, anon, authenticated;
revoke all on function public._agent_resolve_consultorio(text, bigint) from public, anon, authenticated;
revoke all on function public.agent_listar_consultorios(text) from public, anon, authenticated;
revoke all on function public.agent_buscar_paciente(text, text, bigint) from public, anon, authenticated;
revoke all on function public.agent_get_agenda(text, date, date, bigint) from public, anon, authenticated;
revoke all on function public.agent_status_pagamento_paciente(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.agent_listar_debitos_paciente(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.agent_registrar_pagamento_sessao(text, bigint, numeric, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.agent_marcar_atendimento_realizado(text, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.agent_agendar_sessao_avulsa(text, bigint, date, time, numeric, bigint) from public, anon, authenticated;
revoke all on function public.agent_cancelar_sessao(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.agent_gerar_recibo(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.agent_listar_inadimplentes(text, bigint) from public, anon, authenticated;
revoke all on function public.agent_resumo_financeiro(text, date, date, bigint) from public, anon, authenticated;

grant execute on function public.agent_listar_consultorios(text) to service_role;
grant execute on function public.agent_buscar_paciente(text, text, bigint) to service_role;
grant execute on function public.agent_get_agenda(text, date, date, bigint) to service_role;
grant execute on function public.agent_status_pagamento_paciente(text, bigint, bigint) to service_role;
grant execute on function public.agent_listar_debitos_paciente(text, bigint, bigint) to service_role;
grant execute on function public.agent_registrar_pagamento_sessao(text, bigint, numeric, text, bigint, bigint) to service_role;
grant execute on function public.agent_marcar_atendimento_realizado(text, bigint, text, bigint) to service_role;
grant execute on function public.agent_agendar_sessao_avulsa(text, bigint, date, time, numeric, bigint) to service_role;
grant execute on function public.agent_cancelar_sessao(text, bigint, bigint) to service_role;
grant execute on function public.agent_gerar_recibo(text, bigint, bigint) to service_role;
grant execute on function public.agent_listar_inadimplentes(text, bigint) to service_role;
grant execute on function public.agent_resumo_financeiro(text, date, date, bigint) to service_role;
