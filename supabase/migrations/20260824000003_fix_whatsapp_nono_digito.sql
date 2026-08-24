-- Migration: corrige comparacao de numero de WhatsApp para o "nono digito" do Brasil
--
-- Achado em teste real (2026-08-24): o formulario de vinculacao grava o numero
-- como o usuario digita (ex: "5591981910295", com o 9 do celular), mas o JID
-- que a Evolution API/WhatsApp reporta pro mesmo numero pode vir sem esse 9
-- (ex: "559181910295") -- variacao conhecida de numeros brasileiros migrados
-- antes da inclusao do nono digito. A comparacao exata em
-- validar_codigo_whatsapp nunca batia nesse caso.
--
-- Fix: aceitar as duas variantes (com e sem o 9) na comparacao, sem alterar
-- o que fica gravado (a escrita em "Usuarios" continua usando o numero que
-- o Router de fato recebeu do WhatsApp, que e o formato usado em toda leitura
-- futura -- ja e consistente, so a comparacao do codigo de vinculacao precisava
-- de tolerancia).

create or replace function public.validar_codigo_whatsapp(p_whatsapp_number text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro whatsapp_verificacao_codigos%rowtype;
  v_nome text;
begin
  select * into v_registro
  from whatsapp_verificacao_codigos
  where (
      whatsapp_number = p_whatsapp_number
      or whatsapp_number = regexp_replace(p_whatsapp_number, '^(55\d{2})(\d{8})$', '\1' || '9' || '\2')
      or whatsapp_number = regexp_replace(p_whatsapp_number, '^(55\d{2})9(\d{8})$', '\1\2')
    )
    and codigo = p_codigo
    and usado = false
    and expira_em > now()
  order by criado_em desc
  limit 1;

  if v_registro.id is null then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001';
  end if;

  update whatsapp_verificacao_codigos set usado = true where id = v_registro.id;

  update "Usuarios"
  set whatsapp_number = p_whatsapp_number, whatsapp_verified = true
  where id = v_registro.usuario_id
  returning nome into v_nome;

  return jsonb_build_object('usuario_id', v_registro.usuario_id, 'nome', v_nome);
end;
$$;

revoke all on function public.validar_codigo_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.validar_codigo_whatsapp(text, text) to service_role;
