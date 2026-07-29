-- Migration: RPC functions (tools) do agente de WhatsApp
-- Todas as funções de negócio são `security definer` e resolvem o consultorio_id
-- internamente a partir do whatsapp_number verificado — o parâmetro consultorio_id
-- nunca deve ser aceito "cru" vindo do LLM sem essa validação.
-- Chamadas apenas pelo n8n com a service_role key. Ver GRANTs no final do arquivo.

-- ============================================================
-- Helpers internos (prefixo _agent_) — não expor como tool de negócio
-- ============================================================

create or replace function public._agent_get_usuario_id(p_whatsapp_number text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.users
  where whatsapp_number = p_whatsapp_number and whatsapp_verified = true
  limit 1;
$$;

create or replace function public._agent_resolve_consultorio(
  p_whatsapp_number text,
  p_consultorio_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_count int;
  v_result uuid;
begin
  v_usuario_id := public._agent_get_usuario_id(p_whatsapp_number);

  if v_usuario_id is null then
    raise exception 'WHATSAPP_NAO_VINCULADO' using errcode = 'P0001';
  end if;

  if p_consultorio_id is not null then
    select id into v_result
    from public.consultorios
    where id = p_consultorio_id and usuario_id = v_usuario_id;

    if v_result is null then
      raise exception 'CONSULTORIO_INVALIDO' using errcode = 'P0001';
    end if;

    return v_result;
  end if;

  select count(*) into v_count from public.consultorios where usuario_id = v_usuario_id;

  if v_count = 0 then
    raise exception 'SEM_CONSULTORIO_CADASTRADO' using errcode = 'P0001';
  elsif v_count > 1 then
    -- o n8n deve capturar essa exceção e chamar agent_listar_consultorios
    -- para o agente perguntar qual consultório ao usuário
    raise exception 'CONSULTORIO_AMBIGUO' using errcode = 'P0001';
  end if;

  select id into v_result from public.consultorios where usuario_id = v_usuario_id;
  return v_result;
end;
$$;

-- ============================================================
-- Tool: desambiguação de consultório (usada quando há mais de um)
-- ============================================================

create or replace function public.agent_listar_consultorios(p_whatsapp_number text)
returns table (id uuid, nome text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome
  from public.consultorios c
  join public.users u on u.id = c.usuario_id
  where u.whatsapp_number = p_whatsapp_number and u.whatsapp_verified = true
  order by c.nome;
$$;

-- ============================================================
-- Tool: busca fuzzy de paciente por nome (escopada ao consultório resolvido)
-- ============================================================

create or replace function public.agent_buscar_paciente(
  p_whatsapp_number text,
  p_nome text,
  p_consultorio_id uuid default null
)
returns table (id uuid, nome_completo text, similaridade real)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select p.id, p.nome_completo, similarity(p.nome_completo, p_nome) as similaridade
  from public.pacientes p
  where p.consultorio_id = v_consultorio_id
    and similarity(p.nome_completo, p_nome) > 0.3
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
  p_consultorio_id uuid default null
)
returns table (
  sessao_id uuid,
  paciente_nome text,
  data date,
  horario time,
  duracao_min int,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select s.id, p.nome_completo, s.data, s.horario, s.duracao_min, s.status
  from public.sessoes s
  join public.pacientes p on p.id = s.paciente_id
  where s.consultorio_id = v_consultorio_id
    and s.data between p_data_inicio and p_data_fim
  order by s.data, s.horario;
end;
$$;

-- ============================================================
-- Tool: status de pagamento das últimas sessões de um paciente
-- ============================================================

create or replace function public.agent_status_pagamento_paciente(
  p_whatsapp_number text,
  p_paciente_id uuid,
  p_consultorio_id uuid default null
)
returns table (
  sessao_id uuid,
  data date,
  valor_sessao numeric,
  pago boolean,
  valor_pago numeric,
  forma_pagamento text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
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
  from public.sessoes s
  join public.pacientes pac on pac.id = s.paciente_id
  left join public.pagamentos_sessao pg on pg.sessao_id = s.id
  where s.consultorio_id = v_consultorio_id
    and s.paciente_id = p_paciente_id
  order by s.data desc
  limit 20;
end;
$$;

-- ============================================================
-- Tool: débitos de um paciente (sessões realizadas sem pagamento vinculado)
-- ============================================================

create or replace function public.agent_listar_debitos_paciente(
  p_whatsapp_number text,
  p_paciente_id uuid,
  p_consultorio_id uuid default null
)
returns table (sessao_id uuid, data date, valor_devido numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select s.id, s.data, coalesce(pac.valor_sessao, 0)
  from public.sessoes s
  join public.pacientes pac on pac.id = s.paciente_id
  left join public.pagamentos_sessao pg on pg.sessao_id = s.id
  where s.consultorio_id = v_consultorio_id
    and s.paciente_id = p_paciente_id
    and s.status = 'realizada'
    and pg.id is null
  order by s.data;
end;
$$;

-- ============================================================
-- Tool: registrar pagamento de sessão (grava pagamento + lançamento)
-- ============================================================

create or replace function public.agent_registrar_pagamento_sessao(
  p_whatsapp_number text,
  p_sessao_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_conta_id uuid,
  p_consultorio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
  v_paciente_id uuid;
  v_lancamento_id uuid;
  v_pagamento_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select paciente_id into v_paciente_id
  from public.sessoes
  where id = p_sessao_id and consultorio_id = v_consultorio_id;

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into public.lancamentos_financeiros
    (consultorio_id, conta_id, paciente_id, sessao_id, data, descricao, tipo, valor)
  values
    (v_consultorio_id, p_conta_id, v_paciente_id, p_sessao_id, current_date, 'Pagamento de sessão', 'receita', p_valor)
  returning id into v_lancamento_id;

  insert into public.pagamentos_sessao
    (sessao_id, valor, data_pagamento, forma_pagamento, conta_id, lancamento_id)
  values
    (p_sessao_id, p_valor, current_date, p_forma_pagamento, p_conta_id, v_lancamento_id)
  returning id into v_pagamento_id;

  update public.sessoes
  set status = 'realizada'
  where id = p_sessao_id and status <> 'realizada';

  return jsonb_build_object('pagamento_id', v_pagamento_id, 'lancamento_id', v_lancamento_id);
end;
$$;

-- ============================================================
-- Tool: marcar atendimento como realizado
-- ============================================================

create or replace function public.agent_marcar_atendimento_realizado(
  p_whatsapp_number text,
  p_sessao_id uuid,
  p_anotacoes text default null,
  p_consultorio_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  update public.sessoes
  set status = 'realizada',
      anotacoes_atendimento = coalesce(p_anotacoes, anotacoes_atendimento)
  where id = p_sessao_id and consultorio_id = v_consultorio_id;

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
  p_paciente_id uuid,
  p_data date,
  p_horario time,
  p_duracao_min int default 50,
  p_consultorio_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
  v_sessao_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  insert into public.sessoes
    (paciente_id, consultorio_id, data, horario, duracao_min, tipo_sessao, status)
  values
    (p_paciente_id, v_consultorio_id, p_data, p_horario, p_duracao_min, 'avulso', 'marcada')
  returning id into v_sessao_id;

  return v_sessao_id;
end;
$$;

-- ============================================================
-- Tool: cancelar sessão
-- ============================================================

create or replace function public.agent_cancelar_sessao(
  p_whatsapp_number text,
  p_sessao_id uuid,
  p_consultorio_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  update public.sessoes
  set status = 'cancelada'
  where id = p_sessao_id and consultorio_id = v_consultorio_id;

  if not found then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

-- ============================================================
-- Tool: gerar recibo simples
-- ============================================================

create or replace function public.agent_gerar_recibo(
  p_whatsapp_number text,
  p_sessao_id uuid,
  p_consultorio_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
  v_paciente_id uuid;
  v_recibo_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select paciente_id into v_paciente_id
  from public.sessoes
  where id = p_sessao_id and consultorio_id = v_consultorio_id;

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  insert into public.recibos (sessao_id, consultorio_id, paciente_id, data_emissao)
  values (p_sessao_id, v_consultorio_id, v_paciente_id, current_date)
  returning id into v_recibo_id;

  return v_recibo_id;
end;
$$;

-- ============================================================
-- Tool: listar inadimplentes (sessões realizadas sem pagamento)
-- ============================================================

create or replace function public.agent_listar_inadimplentes(
  p_whatsapp_number text,
  p_consultorio_id uuid default null
)
returns table (
  paciente_id uuid,
  paciente_nome text,
  sessao_id uuid,
  data date,
  valor_devido numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  return query
  select p.id, p.nome_completo, s.id, s.data, coalesce(p.valor_sessao, 0)
  from public.sessoes s
  join public.pacientes p on p.id = s.paciente_id
  left join public.pagamentos_sessao pg on pg.sessao_id = s.id
  where s.consultorio_id = v_consultorio_id
    and s.status = 'realizada'
    and pg.id is null
  order by s.data;
end;
$$;

-- ============================================================
-- Tool: resumo financeiro (previsto x realizado)
-- ============================================================

create or replace function public.agent_resumo_financeiro(
  p_whatsapp_number text,
  p_data_inicio date,
  p_data_fim date,
  p_consultorio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultorio_id uuid;
  v_previsto numeric;
  v_realizado numeric;
  v_despesas numeric;
begin
  v_consultorio_id := public._agent_resolve_consultorio(p_whatsapp_number, p_consultorio_id);

  select coalesce(sum(p.valor_sessao), 0) into v_previsto
  from public.sessoes s
  join public.pacientes p on p.id = s.paciente_id
  where s.consultorio_id = v_consultorio_id
    and s.data between p_data_inicio and p_data_fim
    and s.status in ('marcada', 'realizada');

  select coalesce(sum(l.valor), 0) into v_realizado
  from public.lancamentos_financeiros l
  where l.consultorio_id = v_consultorio_id
    and l.tipo = 'receita'
    and l.data between p_data_inicio and p_data_fim;

  select coalesce(sum(l.valor), 0) into v_despesas
  from public.lancamentos_financeiros l
  where l.consultorio_id = v_consultorio_id
    and l.tipo = 'despesa'
    and l.data between p_data_inicio and p_data_fim;

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
-- Isso impede que a chave anon/authenticated do app invoque as tools do
-- agente diretamente via PostgREST, mesmo elas validando consultorio internamente.
-- ============================================================

revoke all on function public._agent_get_usuario_id(text) from public, anon, authenticated;
revoke all on function public._agent_resolve_consultorio(text, uuid) from public, anon, authenticated;
revoke all on function public.agent_listar_consultorios(text) from public, anon, authenticated;
revoke all on function public.agent_buscar_paciente(text, text, uuid) from public, anon, authenticated;
revoke all on function public.agent_get_agenda(text, date, date, uuid) from public, anon, authenticated;
revoke all on function public.agent_status_pagamento_paciente(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_listar_debitos_paciente(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_registrar_pagamento_sessao(text, uuid, numeric, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_marcar_atendimento_realizado(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.agent_agendar_sessao_avulsa(text, uuid, date, time, int, uuid) from public, anon, authenticated;
revoke all on function public.agent_cancelar_sessao(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_gerar_recibo(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_listar_inadimplentes(text, uuid) from public, anon, authenticated;
revoke all on function public.agent_resumo_financeiro(text, date, date, uuid) from public, anon, authenticated;

grant execute on function public.agent_listar_consultorios(text) to service_role;
grant execute on function public.agent_buscar_paciente(text, text, uuid) to service_role;
grant execute on function public.agent_get_agenda(text, date, date, uuid) to service_role;
grant execute on function public.agent_status_pagamento_paciente(text, uuid, uuid) to service_role;
grant execute on function public.agent_listar_debitos_paciente(text, uuid, uuid) to service_role;
grant execute on function public.agent_registrar_pagamento_sessao(text, uuid, numeric, text, uuid, uuid) to service_role;
grant execute on function public.agent_marcar_atendimento_realizado(text, uuid, text, uuid) to service_role;
grant execute on function public.agent_agendar_sessao_avulsa(text, uuid, date, time, int, uuid) to service_role;
grant execute on function public.agent_cancelar_sessao(text, uuid, uuid) to service_role;
grant execute on function public.agent_gerar_recibo(text, uuid, uuid) to service_role;
grant execute on function public.agent_listar_inadimplentes(text, uuid) to service_role;
grant execute on function public.agent_resumo_financeiro(text, date, date, uuid) to service_role;
