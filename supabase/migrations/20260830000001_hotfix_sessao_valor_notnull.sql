-- Hotfix: Sessao.valor foi tornada NOT NULL por uma migration de uma feature
-- em desenvolvimento (branch separada, ainda não mesclada), mas essa
-- migration já foi aplicada ao banco de producao compartilhado. O codigo
-- hoje em producao (main) tem tres pontos que inserem em "Sessao" sem
-- "valor", e por isso comecaram a falhar:
--   1. web/lib/recorrencia.js (gerarSessoesAteHorizonte) — chamado sem
--      tratamento de erro no carregamento do Painel/Agenda, derrubando a
--      pagina inteira (500) quando alguma recorrencia precisa se estender.
--   2. web/lib/actions/sessoes.js (criarSessao) — falha ao criar sessao
--      manualmente pela UI (erro tratado, sem 500, mas quebrado).
--   3. Esta RPC do agente de WhatsApp — falha ao agendar sessao avulsa via
--      WhatsApp.
-- Os pontos 1 e 2 ja foram corrigidos no codigo (deploy separado). Este
-- patch cobre o ponto 3, unico que exige mudanca no banco.
CREATE OR REPLACE FUNCTION public.agent_agendar_sessao_avulsa(p_whatsapp_number text, p_paciente_id bigint, p_data date, p_horario time without time zone, p_duracao_min numeric DEFAULT 50, p_consultorio_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_paciente_ok bigint;
  v_valor_sessao numeric;
  v_sessao_id bigint;
begin
  v_owner := public._agent_get_owner_uuid(p_whatsapp_number);

  select id, valor_sessao into v_paciente_ok, v_valor_sessao
  from "Paciente"
  where id = p_paciente_id and owner = v_owner;

  if v_paciente_ok is null then
    raise exception 'PACIENTE_INVALIDO' using errcode = 'P0001';
  end if;

  insert into "Sessao" (paciente, data, horario, duracao_min, tipo_sessao, status, owner, "Realizado", valor)
  values (p_paciente_id, p_data, p_horario, p_duracao_min, 'avulso', 'marcada', v_owner, false, v_valor_sessao)
  returning id into v_sessao_id;

  return v_sessao_id;
end;
$function$;
