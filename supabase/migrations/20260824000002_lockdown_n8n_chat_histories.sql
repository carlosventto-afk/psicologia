-- Migration: cria n8n_chat_histories ANTES do nó "Postgres Chat Memory" do
-- workflow "WA - Agent Psicólogo" (n8n) rodar pela primeira vez, já travada
-- (Critical #4 da revisão final do branch do agente de WhatsApp).
--
-- O nó n8n (@n8n/n8n-nodes-langchain.memoryPostgresChat) cria essa tabela
-- sozinho, via "CREATE TABLE IF NOT EXISTS", na primeira mensagem
-- processada. Sem essa migration, ela nasceria com o mesmo problema já
-- corrigido em 20260727000004_lockdown_agent_tables.sql: este projeto
-- Supabase concede grant total (select/insert/update/delete/truncate) a
-- anon/authenticated em toda tabela nova criada em "public" por padrão, e o
-- PostgREST expõe automaticamente qualquer tabela nova — só que aqui o
-- conteúdo é a transcrição inteira da conversa (nome do profissional,
-- valores financeiros, texto livre de anamnese que o agente processa),
-- dado de saúde. Confirmado ao vivo antes desta migration:
-- to_regclass('public.n8n_chat_histories') retornava null (tabela ainda não
-- existe) — latente, mas prestes a disparar assim que a primeira mensagem
-- real chegar no Agent workflow.
--
-- Schema: confirmado no código-fonte real da lib que o nó usa por baixo
-- (@langchain/community/dist/stores/message/postgres.cjs,
-- PostgresChatMessageHistory.ensureTable()) — não adivinhado:
--   CREATE TABLE IF NOT EXISTS <tableName> (
--     id SERIAL PRIMARY KEY,
--     session_id VARCHAR(255) NOT NULL,
--     message JSONB NOT NULL
--   );
-- Criando aqui com o mesmo shape, o "CREATE TABLE IF NOT EXISTS" do nó vira
-- um no-op e o lockdown abaixo se mantém (ele nunca tenta alterar
-- grants/RLS de uma tabela que já existe).

create table if not exists public.n8n_chat_histories (
  id serial primary key,
  session_id varchar(255) not null,
  message jsonb not null
);

-- Mesmo padrão de 20260727000004_lockdown_agent_tables.sql: revoke dos
-- grants na tabela + RLS habilitada sem nenhuma policy (deny-all pra
-- anon/authenticated; service_role, usado pelo n8n, continua liberado por
-- bypass nativo de RLS). Adicionalmente, como "id serial" cria uma sequence
-- própria (diferente das tabelas de 000004, que usam uuid/text como chave),
-- revoga também o acesso a essa sequence — Supabase concede uso/select em
-- sequences novas de "public" pro mesmo trio de roles por padrão.
revoke all on public.n8n_chat_histories from anon, authenticated;
revoke all on sequence public.n8n_chat_histories_id_seq from anon, authenticated;

alter table public.n8n_chat_histories enable row level security;
