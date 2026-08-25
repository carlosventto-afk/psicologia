-- O profissional abrindo o proprio link gerado (ex: pra conferir) chega
-- com sessao ativa -- PostgREST executa como "authenticated", nao "anon".
-- As duas RPCs sao protegidas pelo token em si (nao pela identidade do
-- chamador), entao conceder pra authenticated tambem nao abre nada que o
-- anon ja nao tivesse acesso -- mesmo padrao ja usado em
-- usuarios_publicos(bigint[]) (migration 20260804000001).
grant execute on function public.buscar_dados_completar_cadastro(text) to authenticated;
grant execute on function public.enviar_proposta_completar_cadastro(text, text, text, text, text, text, date, text) to authenticated;

-- Defensivo: se este projeto algum dia rodar essa migration contra um
-- banco novo (sem o pgcrypto ja instalado em "extensions" como neste),
-- garante que a extensao existe no schema certo antes do gen_random_bytes
-- qualificado por schema em gerar_link_completar_cadastro funcionar.
create extension if not exists pgcrypto with schema extensions;
