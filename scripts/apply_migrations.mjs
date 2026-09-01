import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL antes de rodar este script.");
  process.exit(1);
}

const files = ["20260901000002_lockdown_leads_cfp.sql"];

const migrationsDir = path.resolve("supabase/migrations");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, "utf8");
  console.log(`\n=== Aplicando ${file} ===`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`OK: ${file} aplicada com sucesso.`);
  } catch (err) {
    await client.query("rollback");
    console.error(`ERRO em ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log("\nTodas as migrations foram aplicadas com sucesso.");

// Guarda permanente contra a classe de bug já corrigida três vezes neste repo
// (20260727000004, 20260824000002, 20260901000002): tabela nova em "public"
// sem RLS fica exposta via PostgREST com grant total pra anon/authenticated.
const rlsCheck = await client.query(`
  select relname
  from pg_class
  join pg_namespace n on n.oid = pg_class.relnamespace
  where n.nspname = 'public' and relkind = 'r' and not relrowsecurity
`);
if (rlsCheck.rows.length > 0) {
  console.error(
    "\nERRO: tabelas em 'public' sem RLS habilitado:",
    rlsCheck.rows.map((r) => r.relname).join(", ")
  );
  await client.end();
  process.exit(1);
}
console.log("OK: todas as tabelas em 'public' têm RLS habilitado.");

await client.end();
