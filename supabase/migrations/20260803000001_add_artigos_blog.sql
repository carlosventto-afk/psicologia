-- Blog público (item 1 do backlog): tabela de artigos, leitura liberada pra
-- qualquer visitante (inclusive anônimo) quando publicado, escrita só admin.
create table public.artigos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  resumo text,
  conteudo text not null,
  autor text,
  publicado boolean not null default false,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.artigos enable row level security;

create policy "artigos_select_publicos" on public.artigos
  for select using (publicado = true or public.is_admin());

create policy "artigos_admin_write" on public.artigos
  for all using (public.is_admin()) with check (public.is_admin());
