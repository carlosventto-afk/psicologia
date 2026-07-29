-- Migration: fecha o acesso público (anon/authenticated) nas tabelas de
-- suporte ao agente de WhatsApp, criadas na migration 000001.
--
-- Supabase concede GRANT total (select/insert/update/delete/truncate) a
-- anon/authenticated por padrão em toda tabela nova criada em "public" —
-- isso não tinha sido revogado, deixando whatsapp_verificacao_codigos,
-- agent_audit_log, agent_sessions e lembretes_enviados abertas pra
-- qualquer um com a anon key (chave pública embutida em qualquer client).
--
-- Essas tabelas só devem ser tocadas pelo n8n via service_role (que ignora
-- RLS/grants de qualquer forma), então aqui fechamos os dois lados:
-- revoke dos grants + RLS habilitada sem nenhuma policy (= deny-all pra
-- anon/authenticated, service_role continua liberado por bypass nativo).

revoke all on public.agent_audit_log from anon, authenticated;
revoke all on public.agent_sessions from anon, authenticated;
revoke all on public.lembretes_enviados from anon, authenticated;
revoke all on public.whatsapp_verificacao_codigos from anon, authenticated;

alter table public.agent_audit_log enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.lembretes_enviados enable row level security;
alter table public.whatsapp_verificacao_codigos enable row level security;
