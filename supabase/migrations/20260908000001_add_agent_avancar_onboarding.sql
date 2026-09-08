-- supabase/migrations/20260908000001_add_agent_avancar_onboarding.sql
--
-- Fecha uma lacuna real da Fase 1: nenhuma das 3 RPCs de criacao
-- (agent_criar_consultorio/paciente/conta_bancaria) avanca
-- agent_sessions.onboarding_etapa, e nao existe jeito de "pular" uma
-- etapa sem criar o registro correspondente. O LLM chama esta tool
-- SEMPRE depois de terminar ou pular uma etapa (spec
-- docs/superpowers/specs/2026-09-08-inicio-operacao-whatsapp-fase2-n8n-design.md).
create or replace function public.agent_avancar_onboarding(
  p_whatsapp_number text,
  p_etapa_atual text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa_real text;
  v_proxima text;
begin
  select onboarding_etapa into v_etapa_real
  from agent_sessions
  where whatsapp_number = p_whatsapp_number;

  if v_etapa_real is null or v_etapa_real <> p_etapa_atual then
    raise exception 'ONBOARDING_ETAPA_INVALIDA' using errcode = 'P0001';
  end if;

  v_proxima := case v_etapa_real
    when 'consultorio' then 'paciente'
    when 'paciente' then 'conta'
    when 'conta' then 'concluido'
    else 'concluido'
  end;

  update agent_sessions set onboarding_etapa = v_proxima
  where whatsapp_number = p_whatsapp_number;

  return v_proxima;
end;
$$;

revoke all on function public.agent_avancar_onboarding(text, text) from public, anon, authenticated;
grant execute on function public.agent_avancar_onboarding(text, text) to service_role;
