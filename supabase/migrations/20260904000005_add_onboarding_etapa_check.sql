-- supabase/migrations/20260904000005_add_onboarding_etapa_check.sql
--
-- Sem essa constraint, um typo futuro ao gravar agent_sessions.onboarding_etapa
-- (ex: 'concluído' com acento, ou 'Concluido' capitalizado) fica silenciosamente
-- diferente do literal exato 'concluido' checado em
-- web/app/api/agent/call-tool/route.js -- e como qualquer valor non-null
-- diferente de 'concluido' e tratado como "ainda em onboarding" (isento de
-- checagem de plano), esse typo concederia acesso gratuito permanente as 3
-- tools de onboarding.
alter table agent_sessions
  add constraint agent_sessions_onboarding_etapa_check
  check (onboarding_etapa is null or onboarding_etapa in (
    'aguardando_confirmacao_email', 'consultorio', 'paciente', 'conta', 'concluido'
  ));
