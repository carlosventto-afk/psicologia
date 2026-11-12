-- NFS-e automatica: bloqueio de exclusao de recebimento com nota ativa e motivo
-- da pendencia da nota na cobranca (item 33).
--
-- NotaFiscal.cobranca aponta para Cobranca, nao para o Recebimento. Sem este
-- bloqueio, excluir o recebimento reabre a cobranca (gatilho do item 32) e deixa
-- a nota autorizada pendurada nela; depois de cancelar a cobranca, um novo
-- recebimento das mesmas sessoes poderia emitir uma SEGUNDA nota.

-- Motivo da ultima tentativa automatica que nao gerou nota (null = sem pendencia).
alter table "Cobranca"
  add column if not exists nota_pendencia text;

-- ============================================================
-- Recebimento BEFORE DELETE: recusa enquanto a cobranca recebida por ele tiver
-- nota 'pendente' ou 'autorizada'.
--
-- Ordem dos gatilhos: o Postgres dispara os BEFORE ROW pelo NOME, em ordem
-- alfabetica. Este precisa rodar ANTES de "Recebimento_cobranca_reabre_delete"
-- (que zera Cobranca.recebimento e esconderia a cobranca desta consulta); por isso
-- o nome "..._cobranca_aa_nota_bloqueia_delete" (aa < reabre). Quando este gatilho
-- recusa, a excecao aborta o comando inteiro: o reabrir nem chega a rodar, e se
-- rodasse seria desfeito. A cobranca nunca fica reaberta com a exclusao recusada.
-- ============================================================
create or replace function public._nota_bloqueia_excluir_recebimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from "Cobranca" c
      join "NotaFiscal" n on n.cobranca = c.id
      where c.recebimento = old.id
        and n.status in ('pendente', 'autorizada')
  ) then
    raise exception 'NOTA: cancele a nota fiscal da cobrança antes de excluir o recebimento.';
  end if;

  return old;
end;
$$;

revoke all on function public._nota_bloqueia_excluir_recebimento() from public, anon, authenticated;

drop trigger if exists "Recebimento_cobranca_aa_nota_bloqueia_delete" on "Recebimento";
create trigger "Recebimento_cobranca_aa_nota_bloqueia_delete"
  before delete on "Recebimento"
  for each row
  execute function public._nota_bloqueia_excluir_recebimento();
