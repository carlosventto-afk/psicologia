-- Migration: habilita Row Level Security em todas as tabelas do projeto
-- (hoje NENHUMA tabela tem RLS ligado — qualquer chave anon/authenticated
-- pode ler/escrever dados de qualquer consultório de qualquer usuário).
--
-- ATENÇÃO: isso muda comportamento real do app FlutterFlow em produção.
-- Testar no ambiente de teste/preview do FlutterFlow logo depois de aplicar,
-- confirmando que login, listagem de pacientes, agenda e financeiro
-- continuam funcionando exatamente como antes para o usuário dono dos dados.

-- Helper: usuário autenticado é admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "Usuarios" where id_user = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- Tabelas com coluna "owner" direta
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['Consultorio', 'ContaFinanceira', 'Paciente', 'PacoteCobranca', 'Sessao', 'LancamentoFinanceiro', 'Recibo']
  loop
    execute format('alter table %I enable row level security;', t);

    execute format(
      'create policy "%s_select_own" on %I for select using (owner = auth.uid() or public.is_admin());',
      lower(t), t
    );
    execute format(
      'create policy "%s_insert_own" on %I for insert with check (owner = auth.uid());',
      lower(t), t
    );
    execute format(
      'create policy "%s_update_own" on %I for update using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());',
      lower(t), t
    );
    execute format(
      'create policy "%s_delete_own" on %I for delete using (owner = auth.uid() or public.is_admin());',
      lower(t), t
    );
  end loop;
end;
$$;

-- ============================================================
-- Reforço: owner default = auth.uid() nas tabelas que já têm coluna owner.
-- Camada extra de segurança — se o app Next.js esquecer de setar `owner`
-- num insert, o banco preenche sozinho em vez de a policy só rejeitar.
-- Não afeta o agente de WhatsApp: as RPCs (service_role) já setam owner
-- explicitamente e service_role ignora RLS/defaults de qualquer forma.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['Consultorio', 'ContaFinanceira', 'Paciente', 'PacoteCobranca', 'Sessao', 'LancamentoFinanceiro', 'Recibo']
  loop
    execute format('alter table %I alter column owner set default auth.uid();', t);
  end loop;
end;
$$;

-- ============================================================
-- PagamentoSessao: não tem "owner" direto, escopo via Sessao.owner
-- ============================================================

alter table "PagamentoSessao" enable row level security;

create policy "pagamentosessao_all_via_sessao" on "PagamentoSessao"
  for all
  using (
    exists (
      select 1 from "Sessao" s
      where s.id = "PagamentoSessao".sessao
        and (s.owner = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from "Sessao" s
      where s.id = "PagamentoSessao".sessao
        and (s.owner = auth.uid() or public.is_admin())
    )
  );

-- ============================================================
-- Usuarios: cada um só enxerga/edita o próprio perfil
-- ============================================================

alter table "Usuarios" enable row level security;

create policy "usuarios_self" on "Usuarios"
  for all
  using (id_user = auth.uid() or public.is_admin())
  with check (id_user = auth.uid() or public.is_admin());

-- ============================================================
-- TipoAtendimento / TipoCobranca: tabelas de referência compartilhadas,
-- leitura liberada para qualquer usuário autenticado, escrita só para admin.
-- ============================================================

alter table "TipoAtendimento" enable row level security;
alter table "TipoCobranca" enable row level security;

create policy "tipoatendimento_select_all" on "TipoAtendimento"
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy "tipoatendimento_write_admin" on "TipoAtendimento"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "tipocobranca_select_all" on "TipoCobranca"
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy "tipocobranca_write_admin" on "TipoCobranca"
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- View v_resumo_financeiro_mensal: por padrão views rodam com o
-- privilégio do dono da view, ignorando RLS de quem consulta. Forçar
-- security_invoker para que a RLS de LancamentoFinanceiro seja respeitada
-- quando o app consulta a view diretamente.
-- ============================================================

alter view v_resumo_financeiro_mensal set (security_invoker = true);
