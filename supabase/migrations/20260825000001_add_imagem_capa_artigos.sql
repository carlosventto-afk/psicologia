-- Coluna de capa do artigo + bucket de Storage pra imagens do blog
-- (capa + imagens inseridas no meio do texto). Escrita restrita a quem
-- já pode escrever em "artigos" hoje (admin ou criador_conteudo) —
-- mesmo predicado da policy artigos_admin_write.
alter table public.artigos add column imagem_capa text;

insert into storage.buckets (id, name, public)
values ('artigos-imagens', 'artigos-imagens', true)
on conflict (id) do nothing;

create policy "artigosimagens_select_todos" on storage.objects
  for select using (bucket_id = 'artigos-imagens');

create policy "artigosimagens_insert_autor" on storage.objects
  for insert with check (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );

create policy "artigosimagens_update_autor" on storage.objects
  for update using (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );

create policy "artigosimagens_delete_autor" on storage.objects
  for delete using (
    bucket_id = 'artigos-imagens'
    and (
      public.is_admin()
      or exists (
        select 1 from "Usuarios" u
        where u.id_user = auth.uid() and u.criador_conteudo = true
      )
    )
  );
