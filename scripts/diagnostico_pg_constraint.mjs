import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const r = await client.query(`
  select conname, conrelid::regclass as tabela, pg_get_constraintdef(oid) as definicao
  from pg_constraint
  where conrelid = '"ContaFinanceira"'::regclass
  order by conname;
`);
console.log("Constraints de ContaFinanceira:");
for (const row of r.rows) {
  console.log(`  ${row.conname}: ${row.definicao}`);
}

await client.end();
