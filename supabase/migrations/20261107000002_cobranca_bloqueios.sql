-- Bloqueios de Cobranca no banco (valem para o app web e para as RPCs do
-- agente de WhatsApp, que escrevem direto nas tabelas).
--
-- Regra de conflito: sessao com vinculo ATIVO em cobranca 'aberta' nao pode
-- receber pagamento por fora da cobranca, nem ser cancelada, excluida ou ter
-- o valor alterado. Para liberar, cancele (ou receba) a cobranca.
--
-- As funcoes sao SECURITY DEFINER com search_path fixo: precisam enxergar
-- CobrancaSessao/Cobranca independentemente da RLS de quem chama (ex.: dentro
-- das RPCs SECURITY DEFINER do agente). Toda mensagem comeca com 'COBRANCA: '.

-- Helper: id da cobranca ABERTA em que a sessao esta (vinculo ativo), ou null.
create or replace function public._cobranca_aberta_da_sessao(p_sessao bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from "CobrancaSessao" cs
    join "Cobranca" c on c.id = cs.cobranca
    join "Sessao" s on s.id = cs.sessao
    where cs.sessao = p_sessao
      and c.owner = s.owner
      and cs.ativa
      and c.situacao = 'aberta'
    limit 1;
$$;

revoke all on function public._cobranca_aberta_da_sessao(bigint) from public, anon, authenticated;

-- ============================================================
-- (a) RecebimentoSessao BEFORE INSERT
-- Passa apenas quando receber_cobranca sinalizou app.cobranca_recebendo = 'on'
-- (vale so na transacao dela; ela zera logo depois do insert).
-- ============================================================
create or replace function public._cobranca_bloqueia_recebimento_sessao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobranca bigint;
begin
  if coalesce(current_setting('app.cobranca_recebendo', true), '') = 'on' then
    return new;
  end if;

  -- No UPDATE so interessa quando a sessao do rateio muda (OLD so e lido aqui).
  if tg_op = 'UPDATE' then
    if new.sessao is not distinct from old.sessao then
      return new;
    end if;
  end if;

  -- Trava a sessao em modo compartilhado: espera uma criar_cobranca concorrente
  -- (FOR UPDATE) terminar, e a leitura abaixo ja enxerga o vinculo dela.
  perform 1 from "Sessao" where id = new.sessao for share;

  v_cobranca := public._cobranca_aberta_da_sessao(new.sessao);

  if v_cobranca is not null then
    raise exception 'COBRANCA: a sessão está na cobrança #% (aberta). Receba pela cobrança.', v_cobranca;
  end if;

  return new;
end;
$$;

revoke all on function public._cobranca_bloqueia_recebimento_sessao() from public, anon, authenticated;

drop trigger if exists "RecebimentoSessao_cobranca_bloqueia_insert" on "RecebimentoSessao";
create trigger "RecebimentoSessao_cobranca_bloqueia_insert"
  before insert or update of sessao on "RecebimentoSessao"
  for each row
  execute function public._cobranca_bloqueia_recebimento_sessao();

-- ============================================================
-- (b) Sessao BEFORE UPDATE: muda valor ou vira cancelada.
-- Comparacao de status sem diferenciar caixa (o agente grava 'cancelada').
-- Outras mudancas (Marcada -> Realizada, anotacoes etc.) passam.
-- ============================================================
create or replace function public._cobranca_bloqueia_update_sessao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobranca bigint;
begin
  if (new.valor is distinct from old.valor)
     or (lower(coalesce(new.status, '')) = 'cancelada'
         and lower(coalesce(old.status, '')) <> 'cancelada') then

    v_cobranca := public._cobranca_aberta_da_sessao(old.id);

    if v_cobranca is not null then
      raise exception 'COBRANCA: cancele ou receba a cobrança #% antes de cancelar, excluir ou alterar o valor da sessão.', v_cobranca;
    end if;
  end if;

  -- Trocar paciente/dono faria receber_cobranca cobrar o pagador errado.
  if (new.paciente is distinct from old.paciente)
     or (new.owner is distinct from old.owner) then

    v_cobranca := public._cobranca_aberta_da_sessao(old.id);

    if v_cobranca is not null then
      raise exception 'COBRANCA: cancele ou receba a cobrança #% antes de trocar o paciente da sessão.', v_cobranca;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public._cobranca_bloqueia_update_sessao() from public, anon, authenticated;

drop trigger if exists "Sessao_cobranca_bloqueia_update" on "Sessao";
create trigger "Sessao_cobranca_bloqueia_update"
  before update on "Sessao"
  for each row
  execute function public._cobranca_bloqueia_update_sessao();

-- ============================================================
-- (c) Sessao BEFORE DELETE
-- ============================================================
create or replace function public._cobranca_bloqueia_delete_sessao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobranca bigint;
begin
  v_cobranca := public._cobranca_aberta_da_sessao(old.id);

  if v_cobranca is not null then
    raise exception 'COBRANCA: cancele ou receba a cobrança #% antes de cancelar, excluir ou alterar o valor da sessão.', v_cobranca;
  end if;

  return old;
end;
$$;

revoke all on function public._cobranca_bloqueia_delete_sessao() from public, anon, authenticated;

drop trigger if exists "Sessao_cobranca_bloqueia_delete" on "Sessao";
create trigger "Sessao_cobranca_bloqueia_delete"
  before delete on "Sessao"
  for each row
  execute function public._cobranca_bloqueia_delete_sessao();

-- ============================================================
-- (d) Recebimento BEFORE DELETE: reabre a cobranca recebida por ele.
-- Precisa ser BEFORE: o update acontece antes do 'on delete set null' da FK e
-- mantem valido o check (situacao <> 'recebida' or recebimento is not null).
-- ============================================================
create or replace function public._cobranca_reabre_ao_excluir_recebimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update "Cobranca"
    set situacao = 'aberta',
        recebimento = null,
        recebida_em = null
    where recebimento = old.id;

  return old;
end;
$$;

revoke all on function public._cobranca_reabre_ao_excluir_recebimento() from public, anon, authenticated;

drop trigger if exists "Recebimento_cobranca_reabre_delete" on "Recebimento";
create trigger "Recebimento_cobranca_reabre_delete"
  before delete on "Recebimento"
  for each row
  execute function public._cobranca_reabre_ao_excluir_recebimento();
