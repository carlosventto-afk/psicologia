-- supabase/migrations/20260828000001_lockdown_usuarios_anon_update.sql

-- A migration 20260827000001 fechou a lacuna de UPDATE irrestrito em
-- "Usuarios" pro role `authenticated`, mas deixou o role `anon` de fora --
-- verificado ao vivo que `anon` ainda tinha UPDATE a nivel de tabela
-- (has_table_privilege('anon', '"Usuarios"', 'UPDATE') = true), o que
-- permitiria uma chamada REST nao autenticada sobrescrever qualquer coluna,
-- incluindo plano/plano_pago/assinatura_status/asaas_*.
--
-- Mesmo padrao ja usado pra `authenticated`: revoga UPDATE a nivel de
-- tabela, depois concede apenas nas colunas de cadastro (nao nas de
-- cobranca). Allowlist identica a atual de `authenticated`.
revoke update on "Usuarios" from anon;
grant update (nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, carne_leao_email, carne_leao_frequencia, carne_leao_ultimo_envio) on "Usuarios" to anon;
