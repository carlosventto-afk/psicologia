-- supabase/migrations/20261105000002_add_teste_plano_usuarios.sql
--
-- Liberacao temporaria de plano (teste): o admin libera um plano pago por
-- prazo determinado sem cobranca. teste_plano guarda o plano liberado,
-- teste_expira_em o fim do teste e teste_aviso_enviado_em marca o aviso de
-- expiracao ja enviado. teste_plano e teste_expira_em andam juntos.
-- Sem GRANT pra authenticated: so service_role escreve nesses campos.
alter table "Usuarios"
  add column teste_plano text
    check (teste_plano in ('gestao', 'gestao_marketing', 'marketing')),
  add column teste_expira_em timestamptz,
  add column teste_aviso_enviado_em timestamptz,
  add constraint "Usuarios_teste_consistente_check"
    check ((teste_plano is null) = (teste_expira_em is null));
