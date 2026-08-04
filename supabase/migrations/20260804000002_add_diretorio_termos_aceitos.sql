-- Aceite dos Termos de Uso do diretório público (extensão do item 2 do
-- backlog — CTA de cadastro + termos). Sem versionamento: se o texto
-- mudar de forma relevante no futuro, o reforço de consentimento é por
-- e-mail, não reabrindo esta coluna.
alter table public."PerfilPublico"
  add column termos_aceitos_em timestamptz;
