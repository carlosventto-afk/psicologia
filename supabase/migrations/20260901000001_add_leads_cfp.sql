create table leads_cfp (
  crp_regiao smallint not null default 5,
  crp_registro integer not null,
  nome text not null,
  situacao text not null,
  data_inscricao date,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (crp_regiao, crp_registro)
);

create table leads_cfp_scan_state (
  crp_regiao smallint primary key,
  max_registro_checked integer not null default 0,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
