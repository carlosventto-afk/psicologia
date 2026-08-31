-- Carne-Leao rastreava "ja incluido num TXT" via PagamentoSessao.carne_leao_gerado_em.
-- Como o Carne-Leao (Task 22) passa a ler RecebimentoSessao, o rastreio
-- precisa da mesma granularidade (uma linha = uma sessao com um valor
-- aplicado) na tabela nova.
alter table "RecebimentoSessao" add column carne_leao_gerado_em timestamptz;

-- Backfill: para toda RecebimentoSessao que corresponde a uma PagamentoSessao
-- ja migrada (Task 4), copia o carne_leao_gerado_em original — sem isso,
-- pagamentos ja incluidos num TXT anterior voltariam a aparecer como
-- "elegiveis" e entrariam duplicados numa proxima geracao.
update "RecebimentoSessao" rs
set carne_leao_gerado_em = ps.carne_leao_gerado_em
from "PagamentoSessao" ps
join "Recebimento" r on r.lancamento = ps.lancamento
where rs.recebimento = r.id
  and rs.sessao = ps.sessao
  and ps.carne_leao_gerado_em is not null;
