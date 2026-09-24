create table leads_diretorio (
  fonte text not null,
  slug text not null,
  nome text not null,
  crp text,
  especialidade text,
  cidade text,
  telefone text,
  endereco text,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  primary key (fonte, slug)
);

create table leads_diretorio_scan_state (
  fonte text primary key,
  cursor text,
  last_error text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);
