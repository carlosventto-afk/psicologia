-- Ledger de dedup de vídeos do YouTube usados como fonte pela rotina de
-- conteúdo técnico/teórico de Psicologia — mesmo papel que
-- noticias_conselhos tem pra rotina de notícias CRP/CFP. Tabela própria
-- (não reaproveita noticias_conselhos) porque esse nome ficaria enganoso
-- guardando URL de vídeo. Sem policy de leitura pública: só a automação
-- (via createAdminClient, ignora RLS) e o admin acessam.
create table public.videos_referencia_blog (
  id uuid primary key default gen_random_uuid(),
  canal text not null,
  url text not null unique,
  titulo text not null,
  descricao_original text,
  publicado_em_origem date,
  usado_em_artigo_id uuid references public.artigos(id),
  descoberto_em timestamptz not null default now()
);

alter table public.videos_referencia_blog enable row level security;

create policy "videos_referencia_blog_admin_all" on public.videos_referencia_blog
  for all using (public.is_admin()) with check (public.is_admin());
