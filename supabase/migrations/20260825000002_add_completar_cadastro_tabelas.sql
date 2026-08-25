-- Link publico pro paciente completar o proprio cadastro (backlog item 14):
-- profissional gera um token de uso unico (7 dias de validade), manda pro
-- paciente por fora do app; paciente abre sem login e envia telefone/email/
-- endereco/cpf/rg, que vira uma PROPOSTA pendente -- nunca sobrescreve
-- Paciente direto. Profissional revisa e aceita (por campo, com opcao de
-- desmarcar algum) ou rejeita. Toda leitura/escrita passa pelas RPCs da
-- migration seguinte (security definer), nao por policy de RLS direta.
create table "TokenCompletarCadastro" (
  id uuid primary key default gen_random_uuid(),
  paciente_id bigint not null references "Paciente"(id) on delete cascade,
  token text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz
);

create index tokencompletarcadastro_paciente_idx on "TokenCompletarCadastro"(paciente_id);

-- rejeitada pode ainda ser aceita ("profissional muda de ideia") ate 60
-- dias da criacao; pendente fica sem prazo, esperando o profissional agir.
create table "PropostaCompletarCadastro" (
  id uuid primary key default gen_random_uuid(),
  paciente_id bigint not null references "Paciente"(id) on delete cascade,
  token_id uuid not null references "TokenCompletarCadastro"(id),
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'rejeitada')),
  telefone_pendente text,
  email_pendente text,
  endereco_pendente text,
  cpf_pendente text,
  rg_numero_pendente text,
  rg_data_expedicao_pendente date,
  rg_orgao_emissor_pendente text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);

create index propostacompletarcadastro_paciente_idx on "PropostaCompletarCadastro"(paciente_id);

alter table "TokenCompletarCadastro" enable row level security;
alter table "PropostaCompletarCadastro" enable row level security;

-- TokenCompletarCadastro: nenhuma policy -- nem anon nem authenticated leem
-- ou escrevem a tabela direto, so as RPCs (security definer) da proxima
-- migration acessam.

-- PropostaCompletarCadastro: so leitura pro profissional dono do paciente,
-- mesmo padrao em join ja usado por Anamnese/AnamneseFollowup. Escrita so
-- pelas RPCs.
create policy "propostacompletarcadastro_select_dono" on "PropostaCompletarCadastro"
  for select using (
    exists (
      select 1 from "Paciente" p
      where p.id = "PropostaCompletarCadastro".paciente_id
        and (p.owner = auth.uid() or public.is_admin())
    )
  );
