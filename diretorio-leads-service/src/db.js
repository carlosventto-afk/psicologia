import pg from "pg";

export function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Defina DATABASE_URL antes de rodar o serviço.");
  }
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  pool.on("error", (err) => {
    console.error("[diretorio-leads] erro em client idle do pool:", err.message);
  });
  return pool;
}

export async function getScanState(pool, fonte) {
  const { rows } = await pool.query(
    `select cursor, last_error, last_run_at from leads_diretorio_scan_state where fonte = $1`,
    [fonte]
  );
  if (rows.length === 0) {
    return { cursor: null, lastError: null, lastRunAt: null };
  }
  return { cursor: rows[0].cursor, lastError: rows[0].last_error, lastRunAt: rows[0].last_run_at };
}

export async function upsertLead(pool, lead) {
  await pool.query(
    `insert into leads_diretorio (fonte, slug, nome, crp, especialidade, cidade, telefone, endereco, url, last_checked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (fonte, slug)
     do update set nome = excluded.nome,
                   crp = excluded.crp,
                   especialidade = excluded.especialidade,
                   cidade = excluded.cidade,
                   telefone = excluded.telefone,
                   endereco = excluded.endereco,
                   url = excluded.url,
                   last_checked_at = now()`,
    [lead.fonte, lead.slug, lead.nome, lead.crp, lead.especialidade, lead.cidade, lead.telefone, lead.endereco, lead.url]
  );
}

export async function saveScanState(pool, fonte, { cursor, lastError }) {
  await pool.query(
    `insert into leads_diretorio_scan_state (fonte, cursor, last_error, last_run_at, updated_at)
     values ($1, $2, $3, now(), now())
     on conflict (fonte)
     do update set cursor = excluded.cursor,
                   last_error = excluded.last_error,
                   last_run_at = now(),
                   updated_at = now()`,
    [fonte, cursor ?? null, lastError ?? null]
  );
}
