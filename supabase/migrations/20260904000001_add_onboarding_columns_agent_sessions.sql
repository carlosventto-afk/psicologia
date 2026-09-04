-- supabase/migrations/20260904000001_add_onboarding_columns_agent_sessions.sql
--
-- Suporte ao cadastro/onboarding/revalidacao 100% via WhatsApp (spec
-- docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md):
-- ultima_interacao_em/ultima_validacao_seguranca_em alimentam a janela de
-- 30 dias de revalidacao; onboarding_etapa guarda o progresso do
-- onboarding guiado (null -> aguardando_confirmacao_email -> consultorio
-- -> paciente -> conta -> concluido); link_confirmacao_pendente e como
-- /auth/callback e /auth/confirm sabem que um clique de link precisa
-- acordar o webhook do n8n; tentativas_cadastro/tentativas_cadastro_desde
-- implementam o limite anti-abuso de 3 criacoes de conta por numero em
-- 24h. RLS ja e deny-all pra anon/authenticated nesta tabela
-- (20260727000004_lockdown_agent_tables.sql), colunas novas herdam isso
-- automaticamente.
alter table agent_sessions
  add column ultima_interacao_em timestamptz,
  add column ultima_validacao_seguranca_em timestamptz,
  add column onboarding_etapa text,
  add column link_confirmacao_pendente boolean not null default false,
  add column tentativas_cadastro int not null default 0,
  add column tentativas_cadastro_desde timestamptz;
