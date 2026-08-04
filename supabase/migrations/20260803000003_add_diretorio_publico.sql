-- Diretório público de psicólogos (item 2 do backlog). PerfilPublico é
-- separado de Usuarios de propósito: Usuarios não tem policy de leitura
-- pública hoje (só id_user = auth.uid() or is_admin()), então uma tabela
-- própria com policy estreita evita vazar campo sensível (e-mail, role)
-- por engano.
create table public."PerfilPublico" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null unique references "Usuarios"(id) on delete cascade,
  slug text not null unique,
  bio text,
  foto_url text,
  cidade text,
  estado text,
  valor_sessao numeric,
  modalidade text not null default 'ambos'
    check (modalidade in ('presencial', 'online', 'ambos')),
  visivel_diretorio boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public."Especialidade" (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table public."PerfilEspecialidade" (
  perfil_id uuid not null references "PerfilPublico"(id) on delete cascade,
  especialidade_id uuid not null references "Especialidade"(id) on delete cascade,
  primary key (perfil_id, especialidade_id)
);

create table public."ContatoDiretorio" (
  id uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references "Usuarios"(id) on delete cascade,
  criado_em timestamptz not null default now(),
  origem text not null default 'perfil'
);

-- RLS: PerfilPublico
alter table public."PerfilPublico" enable row level security;

-- Público só vê perfil de quem está visível E aprovado (fecha um gap: sem
-- o "and aprovado", um autocadastro pendente poderia se tornar visível
-- publicamente antes de ser aprovado pelo admin, o que contraria o
-- propósito do aprovado do item 3).
create policy "perfilpublico_select_publico" on public."PerfilPublico"
  for select using (
    (
      visivel_diretorio = true
      and exists (
        select 1 from "Usuarios" u
        where u.id = usuario_id and u.aprovado = true
      )
    )
    or exists (
      select 1 from "Usuarios" u
      where u.id = usuario_id and u.id_user = auth.uid()
    )
    or public.is_admin()
  );

create policy "perfilpublico_write_dono" on public."PerfilPublico"
  for insert with check (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

create policy "perfilpublico_update_dono" on public."PerfilPublico"
  for update using (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  ) with check (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

-- RLS: Especialidade (lista de referência, leitura livre pra anon e authenticated)
alter table public."Especialidade" enable row level security;

create policy "especialidade_select_todos" on public."Especialidade"
  for select using (true);

-- RLS: PerfilEspecialidade (acompanha a visibilidade do PerfilPublico relacionado)
alter table public."PerfilEspecialidade" enable row level security;

create policy "perfilespecialidade_select_publico" on public."PerfilEspecialidade"
  for select using (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id
        and (
          (p.visivel_diretorio = true and u.aprovado = true)
          or u.id_user = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy "perfilespecialidade_write_dono" on public."PerfilEspecialidade"
  for all using (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id and (u.id_user = auth.uid() or public.is_admin())
    )
  ) with check (
    exists (
      select 1 from "PerfilPublico" p
      join "Usuarios" u on u.id = p.usuario_id
      where p.id = perfil_id and (u.id_user = auth.uid() or public.is_admin())
    )
  );

-- RLS: ContatoDiretorio (visitante grava, só o dono/admin lê)
alter table public."ContatoDiretorio" enable row level security;

create policy "contatodiretorio_insert_todos" on public."ContatoDiretorio"
  for insert with check (true);

create policy "contatodiretorio_select_dono" on public."ContatoDiretorio"
  for select using (
    exists (select 1 from "Usuarios" u where u.id = usuario_id and u.id_user = auth.uid())
    or public.is_admin()
  );

-- Seed inicial de especialidades (lista fixa, sem UI de admin pra
-- gerenciar — mesmo padrão de TipoAtendimento/TipoCobranca).
insert into public."Especialidade" (nome) values
  ('Terapia Cognitivo-Comportamental (TCC)'),
  ('Psicanálise'),
  ('Terapia Humanista'),
  ('Gestalt-terapia'),
  ('Terapia Sistêmica/Familiar'),
  ('Terapia de Casal'),
  ('Ansiedade'),
  ('Depressão'),
  ('Luto'),
  ('Transtornos Alimentares'),
  ('TDAH'),
  ('Autismo/Neurodivergência'),
  ('Dependência Química'),
  ('Psicologia Infantil'),
  ('Psicologia do Adolescente'),
  ('Psicologia Organizacional/Carreira'),
  ('Sexualidade'),
  ('Gênero e LGBTQIA+'),
  ('Trauma/TEPT');

-- Storage: bucket público de fotos de perfil (primeira vez que o projeto
-- usa Storage). Caminho de upload é sempre "<auth.uid()>/arquivo", então
-- a policy de escrita não precisa fazer join nenhum.
insert into storage.buckets (id, name, public)
values ('perfis-publicos', 'perfis-publicos', true)
on conflict (id) do nothing;

create policy "perfispublicos_select_todos" on storage.objects
  for select using (bucket_id = 'perfis-publicos');

create policy "perfispublicos_insert_dono" on storage.objects
  for insert with check (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "perfispublicos_update_dono" on storage.objects
  for update using (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "perfispublicos_delete_dono" on storage.objects
  for delete using (
    bucket_id = 'perfis-publicos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
