-- Migration: fecha o acesso público (anon/authenticated) na tabela de
-- auditoria dos envios automáticos do Carnê-Leão, criada na migration
-- 20260813000004.
--
-- Mesmo motivo da migration 20260727000004 (lockdown das tabelas do
-- agente de WhatsApp): o Supabase concede GRANT total a anon/authenticated
-- por padrão em toda tabela nova criada em "public", o que deixaria o
-- histórico de envios de TODOS os profissionais legível/gravável por
-- qualquer um com a anon key (chave pública embutida em qualquer client).
--
-- Essa tabela só é tocada pela rota /carne-leao-automatico via
-- service_role (createAdminClient, que ignora RLS/grants por bypass
-- nativo) — não existe nenhuma UI de usuário lendo ou escrevendo nela.
-- Por isso RLS habilitada SEM nenhuma policy é o correto aqui: deny-all
-- pra anon/authenticated, service_role continua liberado.

revoke all on public."EnvioAutomaticoCarneLeao" from anon, authenticated;
alter table public."EnvioAutomaticoCarneLeao" enable row level security;
