-- Fecha leads_cfp e leads_cfp_scan_state pro mesmo padrão de
-- 20260727000004_lockdown_agent_tables.sql / 20260824000002_lockdown_n8n_chat_histories.sql:
-- este projeto Supabase concede grant total a anon/authenticated em toda
-- tabela nova de "public" por padrão, e o PostgREST expõe automaticamente
-- qualquer tabela nova. leads_cfp contém a lista de leads raspada (o ativo
-- comercial desta entrega) e leads_cfp_scan_state controla o progresso do
-- backfill — ambas precisam ficar inacessíveis via API pública. O serviço
-- (cfp-leads-service) conecta como owner via DATABASE_URL, que ignora RLS,
-- então isso não afeta o funcionamento normal.
--
-- Sem sequence a revogar: as duas tabelas usam chaves smallint/integer
-- simples, não serial.

revoke all on public.leads_cfp from anon, authenticated;
revoke all on public.leads_cfp_scan_state from anon, authenticated;

alter table public.leads_cfp enable row level security;
alter table public.leads_cfp_scan_state enable row level security;
