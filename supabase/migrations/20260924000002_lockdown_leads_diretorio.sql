-- Mesmo padrão de 20260901000002_lockdown_leads_cfp.sql: toda tabela nova em
-- "public" fica exposta via PostgREST com grant total a anon/authenticated
-- por padrão neste projeto Supabase. leads_diretorio guarda telefone e
-- endereço (dado pessoal, não só nome público de diretório) — ainda mais
-- crítico manter fechada do que leads_cfp. O serviço
-- (diretorio-leads-service) conecta como owner via DATABASE_URL, que ignora
-- RLS, então isso não afeta o funcionamento normal.

revoke all on public.leads_diretorio from anon, authenticated;
revoke all on public.leads_diretorio_scan_state from anon, authenticated;

alter table public.leads_diretorio enable row level security;
alter table public.leads_diretorio_scan_state enable row level security;
