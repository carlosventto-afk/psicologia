-- NFS-e: de onde vem a competencia (dCompet) da nota.
--
--   'atendimentos' (padrao): data do ultimo atendimento da cobranca (ou a data de cada
--                            sessao, no modo "uma nota por sessao") -- comportamento anterior;
--   'pagamento':             data do pagamento informada ao receber a cobranca
--                            (Recebimento.data_recebimento).
--
-- Configuracao por profissional (Configuracoes > NFS-e), lida na emissao. Aditiva: as linhas
-- existentes ficam em 'atendimentos' e nenhuma nota ja emitida muda.
alter table "DadosFiscaisProfissional"
  add column competencia_origem text not null default 'atendimentos'
    check (competencia_origem in ('atendimentos', 'pagamento'));
