import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL antes de rodar este script.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const fks = await client.query(`
  select
    tc.table_name, kcu.column_name,
    ccu.table_name as foreign_table, ccu.column_name as foreign_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
  join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  order by tc.table_name;
`);
console.log("=== FOREIGN KEYS ===");
for (const r of fks.rows) {
  console.log(`  ${r.table_name}.${r.column_name} -> ${r.foreign_table}.${r.foreign_column}`);
}

const policies = await client.query(`
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
  order by tablename, policyname;
`);
console.log("\n=== RLS POLICIES ===");
for (const p of policies.rows) {
  console.log(`  ${p.tablename} :: ${p.policyname} (${p.cmd}, roles=${p.roles})`);
  console.log(`    USING: ${p.qual}`);
  console.log(`    WITH CHECK: ${p.with_check}`);
}

const rlsEnabled = await client.query(`
  select relname, relrowsecurity
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where nspname = 'public' and relkind = 'r';
`);
console.log("\n=== RLS ENABLED? ===");
for (const r of rlsEnabled.rows) {
  console.log(`  ${r.relname}: ${r.relrowsecurity}`);
}

await client.end();
