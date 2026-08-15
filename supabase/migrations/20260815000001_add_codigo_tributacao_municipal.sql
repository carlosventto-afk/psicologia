-- Desdobro municipal do codigo de tributacao nacional (LC116). Alguns
-- municipios (ex.: Rio de Janeiro) rejeitam a DPS com E0312 ("nao
-- administrado") sem esse campo, mesmo com o codigo nacional correto --
-- confirmado contra nota real emitida pelo EmissorWeb oficial em
-- 15/08/2026 (mesma prestadora, mesmo municipio, mesmo codigo nacional).
alter table "DadosFiscaisProfissional"
  add column codigo_tributacao_municipal text;
