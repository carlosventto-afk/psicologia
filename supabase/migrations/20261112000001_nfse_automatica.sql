-- NFS-e automatica a partir da Cobranca recebida (item 33), parte de banco.
--
-- Esta migration:
--   1. adiciona colunas em NotaFiscal (nota por cobranca, PDF, entrega, tentativas,
--      snapshot do tomador) e troca o check de "origem unica" para 3 origens;
--   2. adiciona flags: Paciente.nota_por_sessao, Cobranca.emissao_por,
--      DadosFiscaisProfissional.emissao_automatica;
--   3. cria registrar_nota_fiscal_cobranca_pendente e substitui
--      registrar_nota_fiscal_pendente, ambas com p_owner explicito (service_role)
--      e com guarda mutua (nota da cobranca x nota por sessao);
--   4. troca a assinatura de criar_cobranca (novo p_emissao_por).
--
-- Mensagens de erro das RPCs de nota comecam com 'NOTA: '; as de cobranca
-- continuam com 'COBRANCA: '.

-- ============================================================
-- 1. NotaFiscal: nova origem (cobranca) e colunas de entrega
-- ============================================================
alter table "NotaFiscal"
  add column cobranca bigint references "Cobranca"(id),
  add column pdf_base64 text,
  add column enviada_email_em timestamptz,
  add column enviada_whatsapp_em timestamptz,
  add column tentativas int not null default 0,
  add column ultimo_erro text,
  -- Snapshot do tomador no momento da emissao: entrega e reprocessamento
  -- nunca re-derivam o destinatario (o cadastro pode mudar depois).
  add column tomador_nome text,
  add column tomador_documento text,
  add column tomador_email text,
  add column tomador_telefone text;

-- Exatamente uma origem: pagamento (legado), recebimento_sessao (por sessao)
-- ou cobranca (uma nota para a cobranca inteira). Linhas existentes tem
-- cobranca nula, entao continuam validas.
alter table "NotaFiscal"
  drop constraint notafiscal_pagamento_ou_recebimento_check;

alter table "NotaFiscal"
  add constraint notafiscal_origem_check
    check (num_nonnulls(pagamento_sessao, recebimento_sessao, cobranca) = 1);

-- Nota pendente/autorizada bloqueia nova nota para a mesma cobranca;
-- rejeitada/cancelada libera (mesmo raciocinio dos indices de pagamento/recebimento).
create unique index notafiscal_cobranca_ativa
  on "NotaFiscal" (cobranca)
  where status in ('pendente', 'autorizada');

-- Busca de notas rejeitadas/canceladas de uma cobranca (o parcial acima so cobre as ativas).
create index notafiscal_cobranca_idx
  on "NotaFiscal" (cobranca)
  where cobranca is not null;

-- RLS: antes so conferia owner = auth.uid(), entao um profissional podia gravar
-- NotaFiscal apontando para a cobranca (ou recebimento) de outro e ocupar o
-- indice unico parcial, bloqueando a emissao legitima. Agora as referencias
-- tambem precisam ser do proprio usuario (a checagem de FK ignora RLS; os
-- subselects rodam com a RLS do chamador, que enxerga as proprias linhas).
-- Admin continua podendo atualizar (como na policy original); select/delete intactos.
drop policy "notafiscal_insert_own" on "NotaFiscal";
create policy "notafiscal_insert_own" on "NotaFiscal"
  for insert with check (
    owner = auth.uid()
    and ("NotaFiscal".cobranca is null
         or exists (select 1 from "Cobranca" c
                      where c.id = "NotaFiscal".cobranca and c.owner = auth.uid()))
    and ("NotaFiscal".recebimento_sessao is null
         or exists (select 1 from "RecebimentoSessao" rs
                      join "Sessao" s on s.id = rs.sessao
                      where rs.id = "NotaFiscal".recebimento_sessao and s.owner = auth.uid()))
  );

drop policy "notafiscal_update_own" on "NotaFiscal";
create policy "notafiscal_update_own" on "NotaFiscal"
  for update using (owner = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      owner = auth.uid()
      and ("NotaFiscal".cobranca is null
           or exists (select 1 from "Cobranca" c
                        where c.id = "NotaFiscal".cobranca and c.owner = auth.uid()))
      and ("NotaFiscal".recebimento_sessao is null
           or exists (select 1 from "RecebimentoSessao" rs
                        join "Sessao" s on s.id = rs.sessao
                        where rs.id = "NotaFiscal".recebimento_sessao and s.owner = auth.uid()))
    )
  );

-- ============================================================
-- 2. Flags
-- ============================================================
alter table "Paciente"
  add column nota_por_sessao boolean not null default false;

alter table "Cobranca"
  add column emissao_por text not null default 'cobranca'
    check (emissao_por in ('cobranca', 'sessao'));

alter table "DadosFiscaisProfissional"
  add column emissao_automatica boolean not null default false;

-- ============================================================
-- 3a. registrar_nota_fiscal_cobranca_pendente
--
-- SECURITY INVOKER (como a original): a RLS vale para o profissional logado.
-- O caminho service_role funciona sem DEFINER porque service_role ignora RLS
-- (BYPASSRLS); nesse caminho auth.uid() e nulo, entao TODA escrita e leitura
-- usa v_owner (= p_owner) explicitamente, nunca auth.uid().
-- Autorizacao de p_owner: p_owner = auth.uid() OU o chamador e service_role
-- (current_user, que o PostgREST fixa pelo papel do JWT e nao pode ser forjado
-- por GUC de sessao).
-- Serializacao: trava Cobranca e depois as Sessoes cobertas (ordem por id); a
-- outra RPC trava a(s) Sessao(oes) antes de checar, entao as duas nunca emitem
-- nota para a mesma sessao.
-- Cuidado: as colunas de saida (id, numero, serie, ambiente) sao variaveis
-- plpgsql; por isso toda referencia a essas colunas nas queries e qualificada.
-- ============================================================
create or replace function public.registrar_nota_fiscal_cobranca_pendente(
  p_cobranca bigint,
  p_owner uuid default auth.uid()
)
returns table (id bigint, numero int, serie text, ambiente text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := p_owner;
  v_cob "Cobranca"%rowtype;
  v_numero int;
  v_serie text;
  v_ambiente text;
  v_id bigint;
  v_conflitos int;
begin
  if v_owner is null then
    raise exception 'NOTA: profissional não identificado.';
  end if;

  if v_owner is distinct from auth.uid() and current_user <> 'service_role' then
    raise exception 'NOTA: não é permitido emitir nota em nome de outro profissional.';
  end if;

  -- Trava a cobranca (antes das sessoes, mesma ordem do item 32).
  select * into v_cob
    from "Cobranca"
    where "Cobranca".id = p_cobranca and "Cobranca".owner = v_owner
    for update;

  if not found then
    raise exception 'NOTA: cobrança não encontrada para este profissional.';
  end if;

  if v_cob.situacao <> 'recebida' or v_cob.recebimento is null then
    raise exception 'NOTA: só é possível emitir nota de cobrança recebida (situação: %).', v_cob.situacao;
  end if;

  if v_cob.tipo_documento <> 'nota_fiscal' then
    raise exception 'NOTA: a cobrança não é do tipo nota fiscal.';
  end if;

  if v_cob.emissao_por <> 'cobranca' then
    raise exception 'NOTA: esta cobrança emite nota por sessão, não uma nota única.';
  end if;

  -- Trava as sessoes cobertas: vinculos ativos da cobranca + rateio do seu recebimento.
  perform 1
    from "Sessao" s
    where s.id in (
            select cs.sessao from "CobrancaSessao" cs
              where cs.cobranca = v_cob.id and cs.ativa
            union
            select rs.sessao from "RecebimentoSessao" rs
              where rs.recebimento = v_cob.recebimento
          )
    order by s.id
    for update;

  -- Guarda mutua: nenhuma sessao coberta pode ter nota ativa por sessao
  -- (recebimento_sessao de qualquer recebimento, ou pagamento_sessao legado).
  select count(*) into v_conflitos
    from (
      select cs.sessao from "CobrancaSessao" cs
        where cs.cobranca = v_cob.id and cs.ativa
      union
      select rs.sessao from "RecebimentoSessao" rs
        where rs.recebimento = v_cob.recebimento
    ) cob
    where exists (
            select 1
              from "NotaFiscal" nf
              join "RecebimentoSessao" rs2 on rs2.id = nf.recebimento_sessao
              where rs2.sessao = cob.sessao
                and nf.status in ('pendente', 'autorizada')
          )
       or exists (
            select 1
              from "NotaFiscal" nf
              join "PagamentoSessao" ps on ps.id = nf.pagamento_sessao
              where ps.sessao = cob.sessao
                and nf.status in ('pendente', 'autorizada')
          );

  if v_conflitos > 0 then
    raise exception 'NOTA: % sessão(ões) desta cobrança já tem nota fiscal por sessão. Cancele essa nota antes de emitir a nota da cobrança.', v_conflitos;
  end if;

  begin
    -- UPDATE...RETURNING trava a linha do profissional e serializa a numeracao.
    update "DadosFiscaisProfissional" df
       set proximo_numero = df.proximo_numero + 1
     where df.owner = v_owner
    returning df.proximo_numero - 1, df.serie, df.ambiente
      into v_numero, v_serie, v_ambiente;

    if v_numero is null then
      raise exception 'NOTA: dados fiscais não configurados para este profissional.';
    end if;

    insert into "NotaFiscal" (owner, cobranca, status, ambiente, numero, serie)
    values (v_owner, v_cob.id, 'pendente', v_ambiente, v_numero, v_serie)
    returning "NotaFiscal".id into v_id;
  exception when unique_violation then
    raise exception 'NOTA: esta cobrança já tem nota fiscal pendente ou autorizada.';
  end;

  return query select v_id, v_numero, v_serie, v_ambiente;
end;
$$;

-- ============================================================
-- 3b. registrar_nota_fiscal_pendente (por sessao), agora com p_owner e guarda.
-- Assinatura muda (novo parametro), entao drop da antiga + create: um
-- create or replace deixaria as duas sobrecargas coexistindo.
-- Chamadas existentes com 1 argumento continuam validas pelo default.
-- ============================================================
drop function if exists public.registrar_nota_fiscal_pendente(bigint);

create function public.registrar_nota_fiscal_pendente(
  p_recebimento_sessao bigint,
  p_owner uuid default auth.uid()
)
returns table (id bigint, numero int, serie text, ambiente text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := p_owner;
  v_sessao bigint;
  v_numero int;
  v_serie text;
  v_ambiente text;
  v_id bigint;
begin
  if v_owner is null then
    raise exception 'NOTA: profissional não identificado.';
  end if;

  if v_owner is distinct from auth.uid() and current_user <> 'service_role' then
    raise exception 'NOTA: não é permitido emitir nota em nome de outro profissional.';
  end if;

  select rs.sessao into v_sessao
    from "RecebimentoSessao" rs
    join "Sessao" s on s.id = rs.sessao
    where rs.id = p_recebimento_sessao and s.owner = v_owner;

  if v_sessao is null then
    raise exception 'NOTA: recebimento não encontrado para este profissional.';
  end if;

  -- Trava a sessao: serializa com registrar_nota_fiscal_cobranca_pendente,
  -- que trava as sessoes cobertas antes de checar. A checagem abaixo e um
  -- statement novo, entao ve o que a outra transacao ja confirmou.
  perform 1 from "Sessao" s where s.id = v_sessao and s.owner = v_owner for update;

  -- Guarda mutua: sessao coberta por nota ativa de cobranca (vinculo ativo
  -- da cobranca ou rateio do recebimento da cobranca).
  if exists (
    select 1
      from "NotaFiscal" nf
      join "Cobranca" c on c.id = nf.cobranca
      where nf.status in ('pendente', 'autorizada')
        and (
          exists (select 1 from "CobrancaSessao" cs
                    where cs.cobranca = c.id and cs.sessao = v_sessao and cs.ativa)
          or exists (select 1 from "RecebimentoSessao" rs3
                       where rs3.recebimento = c.recebimento and rs3.sessao = v_sessao)
        )
  ) then
    raise exception 'NOTA: a sessão já está coberta por uma nota fiscal de cobrança. Cancele essa nota antes de emitir a nota por sessão.';
  end if;

  update "DadosFiscaisProfissional" df
     set proximo_numero = df.proximo_numero + 1
   where df.owner = v_owner
  returning df.proximo_numero - 1, df.serie, df.ambiente into v_numero, v_serie, v_ambiente;

  if v_numero is null then
    raise exception 'NOTA: dados fiscais não configurados para este profissional.';
  end if;

  begin
    insert into "NotaFiscal" (owner, recebimento_sessao, status, ambiente, numero, serie)
    values (v_owner, p_recebimento_sessao, 'pendente', v_ambiente, v_numero, v_serie)
    returning "NotaFiscal".id into v_id;
  exception when unique_violation then
    -- O bloco interno desfaz o insert; a excecao abaixo desfaz tambem o numero consumido.
    raise exception 'NOTA: este recebimento já tem nota fiscal pendente ou autorizada.';
  end;

  return query select v_id, v_numero, v_serie, v_ambiente;
end;
$$;

-- A original nao tinha grants explicitos (execute para public por padrao).
-- Aqui fecha para anon e libera so para quem precisa.
revoke all on function public.registrar_nota_fiscal_cobranca_pendente(bigint, uuid) from public, anon;
revoke all on function public.registrar_nota_fiscal_pendente(bigint, uuid) from public, anon;
grant execute on function public.registrar_nota_fiscal_cobranca_pendente(bigint, uuid) to authenticated, service_role;
grant execute on function public.registrar_nota_fiscal_pendente(bigint, uuid) to authenticated, service_role;

-- ============================================================
-- 4. criar_cobranca com p_emissao_por (item 32 + novo parametro)
-- Mesma funcao de 20261107000001 (nenhuma migration posterior a redefine),
-- com todas as garantias: posse, locks ordenados, saldo recomputado,
-- elegibilidade, unique_violation, prefixo 'COBRANCA: ' e grants.
-- ============================================================
drop function if exists public.criar_cobranca(bigint, bigint[], text, date, bigint);

create function public.criar_cobranca(
  p_paciente bigint,
  p_sessoes bigint[],
  p_tipo_documento text,
  p_periodo date,
  p_responsavel bigint,
  p_emissao_por text default null
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_ids bigint[];
  v_qtd_pedida int;
  v_qtd_travada int;
  v_total numeric;
  v_cobranca bigint;
  v_invalidas int;
  v_emissao text := p_emissao_por;
  v_nota_por_sessao boolean;
begin
  if v_owner is null then
    raise exception 'COBRANCA: usuário não autenticado.';
  end if;

  if p_tipo_documento is null or p_tipo_documento not in ('nenhum', 'recibo', 'nota_fiscal') then
    raise exception 'COBRANCA: tipo de documento inválido.';
  end if;

  if v_emissao is not null and v_emissao not in ('cobranca', 'sessao') then
    raise exception 'COBRANCA: forma de emissão inválida.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(p_sessoes) as x
    where x is not null;
  v_qtd_pedida := coalesce(array_length(v_ids, 1), 0);

  if v_qtd_pedida = 0 then
    raise exception 'COBRANCA: selecione ao menos uma sessão.';
  end if;

  select nota_por_sessao into v_nota_por_sessao
    from "Paciente" where id = p_paciente and owner = v_owner;

  if not found then
    raise exception 'COBRANCA: paciente não encontrado.';
  end if;

  -- Sem valor informado, deriva da preferencia do paciente.
  if v_emissao is null then
    v_emissao := case when v_nota_por_sessao then 'sessao' else 'cobranca' end;
  end if;

  if p_responsavel is null or not exists (
    select 1 from "ResponsavelFinanceiro" where id = p_responsavel and owner = v_owner
  ) then
    raise exception 'COBRANCA: responsável financeiro não encontrado.';
  end if;

  -- Trava as sessoes (ordem por id evita deadlock entre duas criacoes).
  -- Fica de fora qualquer sessao de outro dono ou de outro paciente.
  perform 1
    from "Sessao"
    where id = any(v_ids) and owner = v_owner and paciente = p_paciente
    order by id
    for update;
  get diagnostics v_qtd_travada = row_count;

  if v_qtd_travada <> v_qtd_pedida then
    raise exception 'COBRANCA: alguma sessão selecionada não foi encontrada para este paciente.';
  end if;

  -- Elegibilidade recalculada no servidor: nao cancelada, sem vinculo ativo, saldo > 0.
  select count(*) into v_invalidas
    from "Sessao" s
    where s.id = any(v_ids)
      and (
        lower(s.status) = 'cancelada'
        or exists (select 1 from "CobrancaSessao" cs where cs.sessao = s.id and cs.ativa)
        or coalesce(s.valor, 0) - coalesce(
          (select sum(rs.valor_aplicado) from "RecebimentoSessao" rs where rs.sessao = s.id), 0
        ) <= 0
      );

  if v_invalidas > 0 then
    raise exception 'COBRANCA: % sessão(ões) selecionada(s) não pode(m) ser cobrada(s): já está em outra cobrança, foi cancelada ou não tem saldo a receber.', v_invalidas;
  end if;

  select sum(
           s.valor - coalesce(
             (select sum(rs.valor_aplicado) from "RecebimentoSessao" rs where rs.sessao = s.id), 0
           )
         )
    into v_total
    from "Sessao" s
    where s.id = any(v_ids);

  begin
    insert into "Cobranca" (owner, paciente, responsavel_financeiro, periodo_referencia, valor_total, tipo_documento, emissao_por)
    values (v_owner, p_paciente, p_responsavel, p_periodo, v_total, p_tipo_documento, v_emissao)
    returning id into v_cobranca;

    insert into "CobrancaSessao" (cobranca, sessao, valor, owner)
    select v_cobranca,
           s.id,
           s.valor - coalesce(
             (select sum(rs.valor_aplicado) from "RecebimentoSessao" rs where rs.sessao = s.id), 0
           ),
           v_owner
      from "Sessao" s
      where s.id = any(v_ids);
  exception when unique_violation then
    raise exception 'COBRANCA: alguma sessão selecionada já entrou em outra cobrança. Atualize a tela e tente de novo.';
  end;

  return v_cobranca;
end;
$$;

revoke all on function public.criar_cobranca(bigint, bigint[], text, date, bigint, text) from public, anon;
grant execute on function public.criar_cobranca(bigint, bigint[], text, date, bigint, text) to authenticated;
