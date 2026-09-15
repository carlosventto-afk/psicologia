-- Taxonomia multi-tag do blog: um artigo pode ter várias categorias.
-- Leitura pública liberada (usada pro filtro em /blog, inclusive por
-- visitante anônimo); escrita restrita a admin/criador_conteudo, mesmo
-- padrão de artigos_admin_write.
create table public.categorias (
  id bigint generated always as identity primary key,
  nome text not null,
  slug text not null unique
);

alter table public.categorias enable row level security;

create policy "categorias_select_publica" on public.categorias
  for select using (true);

create policy "categorias_admin_write" on public.categorias
  for all using (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );

insert into public.categorias (nome, slug) values
  ('CRP/CFP', 'crp-cfp'),
  ('Normas', 'normas'),
  ('Psicologia', 'psicologia'),
  ('Psicanálise', 'psicanalise'),
  ('TCC', 'tcc'),
  ('Gestão de Consultório', 'gestao-de-consultorio');

create table public.artigo_categorias (
  artigo_id uuid not null references public.artigos(id) on delete cascade,
  categoria_id bigint not null references public.categorias(id) on delete cascade,
  primary key (artigo_id, categoria_id)
);

alter table public.artigo_categorias enable row level security;

-- Mesma condição de artigos_select_publicos: só expõe vínculo de artigo
-- publicado (ou qualquer um, se admin) — evita vazar tema de rascunho
-- não publicado via leitura direta desta tabela de junção.
create policy "artigo_categorias_select_publica" on public.artigo_categorias
  for select using (
    exists (
      select 1 from public.artigos a
      where a.id = artigo_id and (a.publicado = true or is_admin())
    )
  );

create policy "artigo_categorias_admin_write" on public.artigo_categorias
  for all using (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    is_admin() or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );
