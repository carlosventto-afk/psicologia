-- Migration: fecha o loop de vinculação do WhatsApp (Fase A do agente)
-- A tabela whatsapp_verificacao_codigos já existia (migration 20260727000001)
-- mas nenhuma função gerava ou validava o código de 6 dígitos. Duas RPCs:
-- uma chamada pelo Next.js (authenticated, resolve auth.uid()), outra chamada
-- pelo n8n (service_role) quando um número desconhecido responde com o código.

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
  values (v_usuario_id, p_whatsapp_number, v_codigo, now() + interval '10 minutes');

  return v_codigo;
end;
$$;

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
  where whatsapp_number = p_whatsapp_number
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

revoke all on function public.gerar_codigo_verificacao_whatsapp(text) from public, anon, authenticated;
grant execute on function public.gerar_codigo_verificacao_whatsapp(text) to authenticated;

revoke all on function public.validar_codigo_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.validar_codigo_whatsapp(text, text) to service_role;
