-- A RPC do agente de WhatsApp ainda usava a regra antiga (sessao sem
-- PagamentoSessao = inadimplente). Como o codigo em web/ parou de escrever
-- em PagamentoSessao (Tasks 8-12), toda sessao realizada e paga pelo novo
-- modelo passaria a aparecer como inadimplente pro agente a partir de
-- agora. Migra pra mesma regra de saldo devedor via RecebimentoSessao ja
-- usada em listarInadimplentes() (Task 11).
CREATE OR REPLACE FUNCTION public.agent_listar_inadimplentes(p_whatsapp_number text, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(paciente_id bigint, paciente_nome text, sessao_id bigint, data date, valor_devido real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  return query
  select p.id, p.nome, s.id, s.data, (s.valor - coalesce(sum(rs.valor_aplicado), 0))::real
  from "Sessao" s
  join "Paciente" p on p.id = s.paciente
  left join "RecebimentoSessao" rs on rs.sessao = s.id
  where s.owner = v_owner
    and s."Realizado" = true
  group by p.id, p.nome, s.id, s.data, s.valor
  having s.valor - coalesce(sum(rs.valor_aplicado), 0) > 0
  order by s.data;
end;
$function$;
