-- agent_registrar_pagamento_sessao e agent_excluir_pagamento ainda
-- escreviam/liam PagamentoSessao, mesmo depois das RPCs de leitura
-- (Tasks 20/28) ja terem migrado pro modelo novo. Um pagamento
-- registrado pelo agente ficaria invisivel pro resto do sistema
-- (sessao continuaria devedora, sumiria do Carne-Leao/NFS-e).
--
-- registrar: cobra sempre o saldo devedor real da sessao (Sessao.valor
-- menos o que ja foi aplicado via RecebimentoSessao), ignorando p_valor
-- pro calculo — mesma regra "sem pagamento parcial" do resto do app.
-- Mantido como parametro por estabilidade de assinatura da ferramenta do
-- agente. Usa o ResponsavelFinanceiro "proprio" do paciente da sessao
-- como responsavel (todo paciente tem um, garantido desde o Task 17/27).
-- O retorno mantem a chave "pagamento_id" (agora contendo o id do
-- Recebimento) pelo mesmo motivo de estabilidade de contrato usado nas
-- Tasks 22/24 pro campo pagamentoId em carne-leao.js/notas-fiscais.js.
--
-- Nota: a versao anterior desta funcao (migration 20260827000002) usava
-- tipo='receita' / status='realizada' em minusculo. Isso e uma regressao
-- da correcao feita em 20260727000005_fix_text_casing.sql (que documenta
-- a convencao real do banco: 'Receita'/'Despesa' e 'Realizada' capitalizados).
-- O app Next.js compara ambos exatamente (v_resumo_financeiro_mensal soma
-- por tipo = 'Receita'; components/AgendaMes.js e AgendaGrade.js comparam
-- status === "Realizada" pra colorir a agenda). Como esta migration ja
-- reescreve o corpo inteiro desta funcao, a grafia correta e restaurada
-- aqui tambem — do contrario um pagamento registrado pelo agente marcaria
-- a sessao como "realizada" (minusculo) e ela nao apareceria como
-- concluida na agenda do app, mesmo com o Recebimento correto por baixo.
CREATE OR REPLACE FUNCTION public.agent_registrar_pagamento_sessao(p_whatsapp_number text, p_sessao_id bigint, p_valor numeric, p_forma_pagamento text, p_conta_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_paciente_id bigint;
  v_valor_sessao numeric;
  v_saldo_devedor numeric;
  v_responsavel_id bigint;
  v_lancamento_id bigint;
  v_recebimento_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select s.paciente, s.valor into v_paciente_id, v_valor_sessao
  from "Sessao" s
  where s.id = p_sessao_id and s.owner = v_owner;

  if v_paciente_id is null then
    raise exception 'SESSAO_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  select v_valor_sessao - coalesce(sum(rs.valor_aplicado), 0) into v_saldo_devedor
  from "RecebimentoSessao" rs
  where rs.sessao = p_sessao_id;

  if v_saldo_devedor is null or v_saldo_devedor <= 0 then
    raise exception 'SESSAO_JA_QUITADA' using errcode = 'P0001';
  end if;

  select id into v_responsavel_id
  from "ResponsavelFinanceiro"
  where paciente_vinculado = v_paciente_id;

  if v_responsavel_id is null then
    raise exception 'RESPONSAVEL_FINANCEIRO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  insert into "LancamentoFinanceiro" (data, descricao, valor, tipo, conta, sessao, owner)
  values (current_date, 'Recebimento de sessão', v_saldo_devedor, 'Receita', p_conta_id, null, v_owner)
  returning id into v_lancamento_id;

  insert into "Recebimento" (paciente, responsavel_financeiro, data_recebimento, valor_total, forma_pagamento, conta, lancamento, owner)
  values (v_paciente_id, v_responsavel_id, current_date, v_saldo_devedor, p_forma_pagamento, p_conta_id, v_lancamento_id, v_owner)
  returning id into v_recebimento_id;

  insert into "RecebimentoSessao" (recebimento, sessao, valor_aplicado, owner)
  values (v_recebimento_id, p_sessao_id, v_saldo_devedor, v_owner);

  update "Sessao"
  set status = 'Realizada', "Realizado" = true
  where id = p_sessao_id;

  return jsonb_build_object('pagamento_id', v_recebimento_id, 'lancamento_id', v_lancamento_id);
end;
$function$;

-- excluir: p_pagamento_id agora e um id de Recebimento (o que a funcao
-- acima retorna em "pagamento_id"). Desfaz na mesma ordem de
-- excluirRecebimento (Task 26): alocacoes -> cabecalho -> lancamento.
CREATE OR REPLACE FUNCTION public.agent_excluir_pagamento(p_whatsapp_number text, p_pagamento_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_recebimento_id bigint;
  v_lancamento_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select r.id, r.lancamento into v_recebimento_id, v_lancamento_id
  from "Recebimento" r
  where r.id = p_pagamento_id and r.owner = v_owner;

  if v_recebimento_id is null then
    raise exception 'PAGAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  delete from "RecebimentoSessao" where recebimento = v_recebimento_id;
  delete from "Recebimento" where id = v_recebimento_id;

  if v_lancamento_id is not null then
    delete from "LancamentoFinanceiro" where id = v_lancamento_id;
  end if;

  return true;
exception
  when foreign_key_violation then
    raise exception 'PAGAMENTO_TEM_NOTA_FISCAL' using errcode = 'P0001';
end;
$function$;
