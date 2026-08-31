-- Sem essa trava, criar um responsavel financeiro avulso vinculado a um
-- paciente que ja tem seu "proprio" automatico (Task 4/17/27) produz um
-- segundo ResponsavelFinanceiro com o mesmo paciente_vinculado. Isso
-- quebra verificarVinculosPaciente (Task 25), que usa .maybeSingle() e
-- lanca erro quando ha mais de uma linha — travando a exclusao desse
-- paciente permanentemente.
--
-- Antes de criar o indice, verifica se ja existe algum duplicado em
-- producao. Se existir, a migration falha de proposito (nao tenta
-- mesclar/escolher um automaticamente) — investigar manualmente qual
-- responsavel manter antes de prosseguir.
do $$
declare
  v_duplicados int;
begin
  select count(*) into v_duplicados
  from (
    select paciente_vinculado
    from "ResponsavelFinanceiro"
    where paciente_vinculado is not null
    group by paciente_vinculado
    having count(*) > 1
  ) t;

  if v_duplicados > 0 then
    raise exception 'Encontrados % paciente(s) com mais de um ResponsavelFinanceiro proprio — resolver manualmente antes de aplicar esta migration.', v_duplicados;
  end if;
end;
$$;

create unique index responsavelfinanceiro_paciente_vinculado_unico
  on "ResponsavelFinanceiro" (paciente_vinculado)
  where paciente_vinculado is not null;
