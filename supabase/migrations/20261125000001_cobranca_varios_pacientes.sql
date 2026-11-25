-- Cobranca conjunta: sessoes de varios pacientes que compartilham o MESMO
-- responsavel financeiro podem entrar numa so cobranca (um recebimento e uma
-- nota). Cobranca.paciente continua obrigatorio e passa a ser o paciente
-- "principal" (escolhido pelo app: o da sessao mais antiga). O vinculo por
-- sessao (CobrancaSessao) ja guarda cada sessao, entao nada mais muda no modelo.
--
-- Unica alteracao: a trava de sessoes de criar_cobranca aceita, alem das sessoes
-- do paciente principal, as de pacientes vinculados a p_responsavel
-- (PacienteResponsavelFinanceiro). Mesma assinatura da migration 20261112000001.
-- Com sessoes de um paciente so, o comportamento e identico ao anterior.

create or replace function public.criar_cobranca(
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

  -- Sem valor informado, deriva da preferencia do paciente principal.
  if v_emissao is null then
    v_emissao := case when v_nota_por_sessao then 'sessao' else 'cobranca' end;
  end if;

  if p_responsavel is null or not exists (
    select 1 from "ResponsavelFinanceiro" where id = p_responsavel and owner = v_owner
  ) then
    raise exception 'COBRANCA: responsável financeiro não encontrado.';
  end if;

  -- Trava as sessoes (ordem por id evita deadlock entre duas criacoes).
  -- Fica de fora qualquer sessao de outro dono e a de paciente que nao seja o
  -- principal nem esteja vinculado ao responsavel da cobranca.
  perform 1
    from "Sessao" s
    where s.id = any(v_ids)
      and s.owner = v_owner
      and (
        s.paciente = p_paciente
        or exists (
          select 1 from "PacienteResponsavelFinanceiro" pr
          where pr.paciente = s.paciente and pr.responsavel = p_responsavel
        )
      )
    order by s.id
    for update of s;
  get diagnostics v_qtd_travada = row_count;

  if v_qtd_travada <> v_qtd_pedida then
    raise exception 'COBRANCA: alguma sessão selecionada não foi encontrada para este paciente ou para pacientes do mesmo responsável financeiro.';
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
