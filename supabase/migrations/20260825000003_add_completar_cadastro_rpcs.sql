-- RPCs do link publico de completar cadastro (backlog item 14). Todas
-- security definer, seguindo o mesmo padrao de
-- supabase/migrations/20260730000001_whatsapp_agent_onboarding.sql: uma
-- chamada pelo profissional autenticado (authenticated), duas chamadas
-- pelo paciente sem sessao (anon).
create extension if not exists pgcrypto;

create or replace function public.gerar_link_completar_cadastro(p_paciente_id bigint)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from "Paciente" p
    where p.id = p_paciente_id and (p.owner = auth.uid() or public.is_admin())
  ) then
    raise exception 'PACIENTE_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  -- invalida qualquer link anterior ainda ativo do mesmo paciente -- so o
  -- mais recente funciona.
  update "TokenCompletarCadastro"
  set expira_em = now()
  where paciente_id = p_paciente_id
    and usado_em is null
    and expira_em > now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into "TokenCompletarCadastro" (paciente_id, token, expira_em)
  values (p_paciente_id, v_token, now() + interval '7 days');

  return v_token;
end;
$$;

create or replace function public.buscar_dados_completar_cadastro(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token "TokenCompletarCadastro"%rowtype;
  v_paciente "Paciente"%rowtype;
begin
  select * into v_token
  from "TokenCompletarCadastro"
  where token = p_token and usado_em is null and expira_em > now();

  if v_token.id is null then
    raise exception 'TOKEN_INVALIDO' using errcode = 'P0001';
  end if;

  select * into v_paciente from "Paciente" where id = v_token.paciente_id;

  return jsonb_build_object(
    'nome', v_paciente.nome,
    'telefone', v_paciente.telefone,
    'email', v_paciente.email,
    'endereco', v_paciente.endereco,
    'cpf', v_paciente.cpf,
    'rg_numero', v_paciente.rg_numero,
    'rg_data_expedicao', v_paciente.rg_data_expedicao,
    'rg_orgao_emissor', v_paciente.rg_orgao_emissor
  );
end;
$$;

create or replace function public.enviar_proposta_completar_cadastro(
  p_token text,
  p_telefone text,
  p_email text,
  p_endereco text,
  p_cpf text,
  p_rg_numero text,
  p_rg_data_expedicao date,
  p_rg_orgao_emissor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token "TokenCompletarCadastro"%rowtype;
begin
  select * into v_token
  from "TokenCompletarCadastro"
  where token = p_token and usado_em is null and expira_em > now();

  if v_token.id is null then
    raise exception 'TOKEN_INVALIDO' using errcode = 'P0001';
  end if;

  update "TokenCompletarCadastro" set usado_em = now() where id = v_token.id;

  insert into "PropostaCompletarCadastro" (
    paciente_id, token_id, telefone_pendente, email_pendente, endereco_pendente,
    cpf_pendente, rg_numero_pendente, rg_data_expedicao_pendente, rg_orgao_emissor_pendente
  ) values (
    v_token.paciente_id, v_token.id, p_telefone, p_email, p_endereco,
    p_cpf, p_rg_numero, p_rg_data_expedicao, p_rg_orgao_emissor
  );
end;
$$;

create or replace function public.aceitar_proposta_completar_cadastro(p_proposta_id uuid, p_campos_aceitos text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta "PropostaCompletarCadastro"%rowtype;
begin
  select pc.* into v_proposta
  from "PropostaCompletarCadastro" pc
  join "Paciente" p on p.id = pc.paciente_id
  where pc.id = p_proposta_id and (p.owner = auth.uid() or public.is_admin());

  if v_proposta.id is null then
    raise exception 'PROPOSTA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_proposta.status = 'aceita' then
    raise exception 'JA_DECIDIDA' using errcode = 'P0001';
  end if;

  if v_proposta.status = 'rejeitada' and now() > v_proposta.criado_em + interval '60 days' then
    raise exception 'PRAZO_EXPIRADO' using errcode = 'P0001';
  end if;

  update "Paciente" set
    telefone = case when 'telefone' = any(p_campos_aceitos) then v_proposta.telefone_pendente else telefone end,
    email = case when 'email' = any(p_campos_aceitos) then v_proposta.email_pendente else email end,
    endereco = case when 'endereco' = any(p_campos_aceitos) then v_proposta.endereco_pendente else endereco end,
    cpf = case when 'cpf' = any(p_campos_aceitos) then v_proposta.cpf_pendente else cpf end,
    rg_numero = case when 'rg_numero' = any(p_campos_aceitos) then v_proposta.rg_numero_pendente else rg_numero end,
    rg_data_expedicao = case when 'rg_data_expedicao' = any(p_campos_aceitos) then v_proposta.rg_data_expedicao_pendente else rg_data_expedicao end,
    rg_orgao_emissor = case when 'rg_orgao_emissor' = any(p_campos_aceitos) then v_proposta.rg_orgao_emissor_pendente else rg_orgao_emissor end
  where id = v_proposta.paciente_id;

  update "PropostaCompletarCadastro" set status = 'aceita', decidido_em = now() where id = p_proposta_id;
end;
$$;

create or replace function public.rejeitar_proposta_completar_cadastro(p_proposta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta "PropostaCompletarCadastro"%rowtype;
begin
  select pc.* into v_proposta
  from "PropostaCompletarCadastro" pc
  join "Paciente" p on p.id = pc.paciente_id
  where pc.id = p_proposta_id and (p.owner = auth.uid() or public.is_admin());

  if v_proposta.id is null then
    raise exception 'PROPOSTA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_proposta.status != 'pendente' then
    raise exception 'JA_DECIDIDA' using errcode = 'P0001';
  end if;

  update "PropostaCompletarCadastro" set status = 'rejeitada', decidido_em = now() where id = p_proposta_id;
end;
$$;

revoke all on function public.gerar_link_completar_cadastro(bigint) from public, anon, authenticated;
grant execute on function public.gerar_link_completar_cadastro(bigint) to authenticated;

revoke all on function public.buscar_dados_completar_cadastro(text) from public, anon, authenticated;
grant execute on function public.buscar_dados_completar_cadastro(text) to anon;

revoke all on function public.enviar_proposta_completar_cadastro(text, text, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.enviar_proposta_completar_cadastro(text, text, text, text, text, text, date, text) to anon;

revoke all on function public.aceitar_proposta_completar_cadastro(uuid, text[]) from public, anon, authenticated;
grant execute on function public.aceitar_proposta_completar_cadastro(uuid, text[]) to authenticated;

revoke all on function public.rejeitar_proposta_completar_cadastro(uuid) from public, anon, authenticated;
grant execute on function public.rejeitar_proposta_completar_cadastro(uuid) to authenticated;
