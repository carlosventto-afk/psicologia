-- Corrige perfilpublico_select_publico/perfilespecialidade_select_publico:
-- a checagem de Usuarios.aprovado embutida direto na policy roda sob a
-- RLS da própria Usuarios (usuarios_self), que bloqueia terceiros de
-- verem a linha — então o ramo "público" nunca era satisfeito pra
-- visitante real. Uma função security definer (mesmo padrão do
-- is_admin() já existente) resolve, igual ao resto do RLS deste projeto.
create or replace function public.usuario_aprovado(p_usuario_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "Usuarios" where id = p_usuario_id and aprovado = true
  );
$$;

drop policy if exists "perfilpublico_select_publico" on public."PerfilPublico";
create policy "perfilpublico_select_publico" on public."PerfilPublico"
  for select using (
    (visivel_diretorio = true and public.usuario_aprovado(usuario_id))
    or exists (
      select 1 from "Usuarios" u
      where u.id = usuario_id and u.id_user = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "perfilespecialidade_select_publico" on public."PerfilEspecialidade";
create policy "perfilespecialidade_select_publico" on public."PerfilEspecialidade"
  for select using (
    exists (
      select 1 from "PerfilPublico" p
      where p.id = perfil_id
        and (
          (p.visivel_diretorio = true and public.usuario_aprovado(p.usuario_id))
          or exists (
            select 1 from "Usuarios" u2
            where u2.id = p.usuario_id and u2.id_user = auth.uid()
          )
          or public.is_admin()
        )
    )
  );
