-- supabase/migrations/20260908000002_add_onboarding_rate_limit.sql
--
-- Limite de mensagens pro ramo de conversa de numero desconhecido no
-- WA - Onboarding (n8n): antes desta entrega, qualquer numero podia
-- gerar chamadas de Gemini sem limite so mandando mensagem pro bot,
-- sem nenhum controle de custo/abuso (a Fase 1 so limita a criacao de
-- conta em si, nao a conversa que antecede ela). Decisao do usuario
-- (2026-09-08): maximo 10 mensagens/hora por whatsapp_number nesse
-- ramo, reaproveitando o mesmo padrao de janela deslizante ja usado
-- por tentativas_cadastro.
alter table agent_sessions
  add column mensagens_onboarding_1h int not null default 0,
  add column mensagens_onboarding_desde timestamptz;
