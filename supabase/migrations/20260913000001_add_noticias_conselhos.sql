-- Banco de notícias dos Conselhos de Psicologia (CFP/CRP) — histórico de
-- toda notícia encontrada pela routine diária, usada ou não, pra nunca
-- reescrever a mesma duas vezes. Sem policy de leitura pública: só a
-- automação (via createAdminClient, ignora RLS) e o admin acessam.
create table public.noticias_conselhos (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  url text not null unique,
  titulo text not null,
  resumo_original text,
  publicado_em_origem date,
  usado_em_artigo_id uuid references public.artigos(id),
  descoberto_em timestamptz not null default now()
);

alter table public.noticias_conselhos enable row level security;

create policy "noticias_conselhos_admin_all" on public.noticias_conselhos
  for all using (public.is_admin()) with check (public.is_admin());
