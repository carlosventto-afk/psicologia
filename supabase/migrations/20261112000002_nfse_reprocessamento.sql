-- Reprocessamento de entregas e alertas da NFS-e (item 33, tarefa 7).
--
-- tentativas_entrega: quantas vezes o job tentou ENTREGAR a nota autorizada
--   (diferente de "tentativas", que conta tentativas de EMISSAO).
-- alertada_em: quando o profissional foi avisado por e-mail sobre a nota
--   (uma vez so, por nota). Preenchida apenas apos o envio com sucesso.
--
-- Ambas sao escritas somente pelo job de reprocessamento (service_role);
-- o profissional nunca grava nelas.
alter table "NotaFiscal"
  add column tentativas_entrega int not null default 0,
  add column alertada_em timestamptz;
