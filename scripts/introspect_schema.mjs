// Introspecta o schema "public" do Supabase real via conexão direta Postgres.
// Não hardcodar credenciais aqui — a connection string vem de DATABASE_URL (env var),
// passada inline na chamada do processo, nunca persistida em disco.
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL antes de rodar este script.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

await client.connect();

const { rows: columns } = await client.query(`
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position;
`);

const { rows: functions } = await client.query(`
  select routine_name, data_type as return_type
  from information_schema.routines
  where routine_schema = 'public' and routine_type = 'FUNCTION'
  order by routine_name;
`);

const byTable = {};
for (const col of columns) {
  byTable[col.table_name] ??= [];
  byTable[col.table_name].push(
    `${col.column_name} :: ${col.data_type}${col.is_nullable === "NO" ? " NOT NULL" : ""}${col.column_default ? ` DEFAULT ${col.column_default}` : ""}`
  );
}

console.log("=== TABELAS E COLUNAS (schema public) ===");
for (const [table, cols] of Object.entries(byTable)) {
  console.log(`\n-- ${table}`);
  for (const c of cols) console.log(`  ${c}`);
}

console.log("\n=== FUNCTIONS (schema public) ===");
for (const fn of functions) {
  console.log(`  ${fn.routine_name} -> ${fn.return_type}`);
}

await client.end();
