-- Duas outras RPCs do agente de WhatsApp tinham o mesmo problema do
-- Task 20 (leem PagamentoSessao, que ninguem mais escreve) e tambem
-- usavam Paciente.valor_sessao em vez de Sessao.valor (a fonte da
-- verdade desde o Task 2/7 deste plano) — corrigindo os dois problemas
-- juntos, ja que sao a mesma causa raiz.
CREATE OR REPLACE FUNCTION public.agent_listar_debitos_paciente(p_whatsapp_number text, p_paciente_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sessao_id bigint, data date, valor_devido real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select s.id, s.data, (s.valor - coalesce(sum(rs.valor_aplicado), 0))::real
  from "Sessao" s
  left join "RecebimentoSessao" rs on rs.sessao = s.id
  where s.owner = v_owner
    and s.paciente = p_paciente_id
    and s."Realizado" = true
  group by s.id, s.data, s.valor
  having s.valor - coalesce(sum(rs.valor_aplicado), 0) > 0
  order by s.data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_status_pagamento_paciente(p_whatsapp_number text, p_paciente_id bigint, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sessao_id bigint, data date, valor_sessao real, pago boolean, valor_pago real, forma_pagamento text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select
    s.id,
    s.data,
    s.valor::real,
    coalesce(sum(rs.valor_aplicado), 0) >= s.valor as pago,
    nullif(sum(rs.valor_aplicado), 0)::real,
    (array_agg(r.forma_pagamento) filter (where r.forma_pagamento is not null))[1]
  from "Sessao" s
  left join "RecebimentoSessao" rs on rs.sessao = s.id
  left join "Recebimento" r on r.id = rs.recebimento
  where s.owner = v_owner
    and s.paciente = p_paciente_id
  group by s.id, s.data, s.valor
  order by s.data desc
  limit 20;
end;
$function$;
