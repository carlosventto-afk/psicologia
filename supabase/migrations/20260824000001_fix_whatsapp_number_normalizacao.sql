-- Migration: normaliza whatsapp_number no ponto de escrita (Critical #3 da
-- revisão final do branch do agente de WhatsApp).
--
-- gerar_codigo_verificacao_whatsapp (20260730000001_whatsapp_agent_onboarding.sql)
-- grava o número exatamente como o formulário instrui o profissional a
-- digitar (formato internacional com "+", ex: "+5511999999999" —
-- VincularWhatsappForm.js/web/lib/actions/whatsapp.js). O Router do n8n
-- (Task 4 deste plano) normaliza o JID que a Evolution API manda pra
-- dígitos-only (replace(/\D/g, "")) antes de chamar validar_codigo_whatsapp,
-- que compara "whatsapp_number = p_whatsapp_number" com um "=" simples.
-- "+5511999999999" != "5511999999999" — a comparação nunca bate, então todo
-- profissional que seguir a instrução da própria tela fica preso em "código
-- inválido" pra sempre. Confirmado ao vivo: a única linha real em produção
-- em whatsapp_verificacao_codigos tem o "+" exatamente como o form instrui.
--
-- Fix: normaliza pra dígitos-only no momento do insert (mesmo formato que o
-- Router já usa pra escrever em "Usuarios".whatsapp_number via
-- validar_codigo_whatsapp, que não muda aqui — já recebe o valor do Router
-- já normalizado). Corrige também o dado já gravado.

create or replace function public.gerar_codigo_verificacao_whatsapp(p_whatsapp_number text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id bigint;
  v_codigo text;
begin
  select id into v_usuario_id from "Usuarios" where id_user = auth.uid();

  if v_usuario_id is null then
    raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  v_codigo := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into whatsapp_verificacao_codigos (usuario_id, whatsapp_number, codigo, expira_em)
  values (v_usuario_id, regexp_replace(p_whatsapp_number, '\D', '', 'g'), v_codigo, now() + interval '10 minutes');

  return v_codigo;
end;
$$;

-- Corrige dado já gravado em produção (a única linha real hoje tem "+" no
-- número, exatamente como o form instrui a digitar).
update whatsapp_verificacao_codigos
set whatsapp_number = regexp_replace(whatsapp_number, '\D', '', 'g')
where whatsapp_number ~ '\D';
