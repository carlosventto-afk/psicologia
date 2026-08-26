-- Evita duplicata quando criarClassificacoesPadrao roda em paralelo (ex:
-- clique duplo em "Carregar lista padrão"): sem essa constraint, o padrão
-- "SELECT existentes, calcula faltantes, INSERT faltantes" não é atômico e
-- duas chamadas concorrentes podem inserir os mesmos itens duas vezes.
alter table "ClassificacaoFinanceira"
  add constraint classificacaofinanceira_owner_nome_key unique (owner, nome);
