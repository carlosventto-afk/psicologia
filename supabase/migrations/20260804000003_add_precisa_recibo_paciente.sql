-- "Precisa de recibo": nem todo paciente precisa de recibo emitido pra
-- cada sessão. Nasce como false (Não) mesmo pra pacientes já existentes —
-- decisão explícita do usuário: /recibos passa a listar só sessões de
-- pacientes marcados como "Sim", então o profissional revisa e marca
-- manualmente quem precisa em vez de a tela já vir cheia por padrão.
alter table public."Paciente"
  add column precisa_recibo boolean not null default false;
