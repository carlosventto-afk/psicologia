-- Migration: suporte ao agente de WhatsApp
-- Pressupõe o schema documentado no PRD (Playbook Sua Terapia 14-11-2025.pdf):
-- users, consultorios, pacotes_cobranca, pacientes, sessoes, contas_financeiras,
-- lancamentos_financeiros, pagamentos_sessao, recibos.
-- Confira nomes/tipos de coluna contra o projeto Supabase real antes de rodar.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Vínculo do psicólogo ao número de WhatsApp (substitui o login no uso diário)
alter table public.users
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_verified boolean not null default false;

create unique index if not exists users_whatsapp_number_unique
  on public.users (whatsapp_number)
  where whatsapp_number is not null;

-- Códigos de verificação de 6 dígitos gerados no onboarding (tela "Vincular WhatsApp")
create table if not exists public.whatsapp_verificacao_codigos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.users(id) on delete cascade,
  whatsapp_number text not null,
  codigo text not null,
  expira_em timestamptz not null,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Estado de conversa (qual consultório está "ativo" quando o psicólogo tem mais de um)
create table if not exists public.agent_sessions (
  whatsapp_number text primary key,
  usuario_id uuid references public.users(id) on delete cascade,
  consultorio_ativo_id uuid references public.consultorios(id),
  updated_at timestamptz not null default now()
);

-- Log de auditoria de toda ação do agente (essencial para disputas e LGPD)
create table if not exists public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null,
  consultorio_id uuid references public.consultorios(id),
  tool_name text not null,
  parametros jsonb,
  resultado jsonb,
  sucesso boolean not null default true,
  mensagem_erro text,
  criado_em timestamptz not null default now()
);

create index if not exists agent_audit_log_consultorio_idx
  on public.agent_audit_log (consultorio_id, criado_em desc);

-- Controle de lembretes proativos (evita duplicidade de envio)
create table if not exists public.lembretes_enviados (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes(id) on delete cascade,
  tipo text not null check (tipo in ('lembrete_sessao', 'lembrete_pagamento')),
  enviado_em timestamptz not null default now(),
  unique (sessao_id, tipo)
);

-- Opt-in explícito do paciente para receber lembretes por WhatsApp (LGPD)
alter table public.pacientes
  add column if not exists whatsapp_lembrete_opt_in boolean not null default false;
