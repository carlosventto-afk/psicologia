-- Corrige web/lib/data/diretorio.js (Task 3): buscarPerfisPublicos e
-- buscarPerfilPorSlug precisam do nome (e crp/contato, no caso do
-- detalhe) do psicólogo dono do perfil, e a abordagem óbvia seria embutir
-- "Usuarios!inner(nome, ...)" no select de PerfilPublico. Isso NÃO
-- funciona pra visitante anônimo: a policy "usuarios_self" em Usuarios só
-- libera leitura quando id_user = auth.uid() (ou admin), então o join
-- embutido do PostgREST não enxerga nenhuma linha de Usuarios sob RLS
-- anônimo — e como é "!inner", isso zera o resultado inteiro (confirmado
-- empiricamente: mesma query sem o embed retorna as linhas normalmente,
-- com o embed volta lista vazia). Mesma classe de bug já corrigida em
-- 20260803000004 pra usuario_aprovado() (RLS de uma tabela relacionada
-- bloqueando a leitura embutida usada por outra policy/query) — mesmo
-- remédio: função security definer, mas agora pra expor só os 3 campos
-- realmente públicos (nome, crp, contato), nunca email/whatsapp/role.
create or replace function public.usuarios_publicos(p_usuario_ids bigint[])
returns table (id bigint, nome text, crp text, contato numeric)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nome, u.crp, u.contato
  from "Usuarios" u
  join "PerfilPublico" p on p.usuario_id = u.id
  where u.id = any(p_usuario_ids)
    and p.visivel_diretorio = true
    and public.usuario_aprovado(u.id);
$$;

grant execute on function public.usuarios_publicos(bigint[]) to anon, authenticated;
