-- Papel "criador de conteúdo": permite publicar artigo no blog sem ser
-- admin da plataforma. Evolução pedida do item 1 do backlog.
alter table public."Usuarios"
  add column criador_conteudo boolean not null default false;

drop policy "artigos_admin_write" on public.artigos;

create policy "artigos_admin_write" on public.artigos
  for all using (
    public.is_admin()
    or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from "Usuarios" u
      where u.id_user = auth.uid() and u.criador_conteudo = true
    )
  );
