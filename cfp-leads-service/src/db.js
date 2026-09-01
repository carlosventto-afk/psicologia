import pg from "pg";

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Defina DATABASE_URL antes de rodar o serviço.");
  }
  return new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

export async function getScanState(pool, crpRegiao) {
  const { rows } = await pool.query(
    `select max_registro_checked, last_error, last_run_at
     from leads_cfp_scan_state
     where crp_regiao = $1`,
    [crpRegiao]
  );
  if (rows.length === 0) {
    return { maxRegistroChecked: 0, lastError: null, lastRunAt: null };
  }
  return {
    maxRegistroChecked: rows[0].max_registro_checked,
    lastError: rows[0].last_error,
    lastRunAt: rows[0].last_run_at,
  };
}

export async function upsertLead(pool, lead) {
  await pool.query(
    `insert into leads_cfp (crp_regiao, crp_registro, nome, situacao, data_inscricao, last_checked_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (crp_regiao, crp_registro)
     do update set nome = excluded.nome,
                   situacao = excluded.situacao,
                   data_inscricao = excluded.data_inscricao,
                   last_checked_at = now()`,
    [lead.crpRegiao, lead.crpRegistro, lead.nome, lead.situacao, lead.dataInscricao]
  );
}

export async function saveScanState(pool, crpRegiao, { maxRegistroChecked, lastError }) {
  await pool.query(
    `insert into leads_cfp_scan_state (crp_regiao, max_registro_checked, last_error, last_run_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (crp_regiao)
     do update set max_registro_checked = excluded.max_registro_checked,
                   last_error = excluded.last_error,
                   last_run_at = now(),
                   updated_at = now()`,
    [crpRegiao, maxRegistroChecked, lastError ?? null]
  );
}
