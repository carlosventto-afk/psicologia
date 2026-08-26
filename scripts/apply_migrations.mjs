import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL antes de rodar este script.");
  process.exit(1);
}

const files = [
  "20260826000001_add_classificacao_financeira.sql",
  "20260826000002_add_recorrencia_despesa.sql",
];

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

await client.end();
console.log("\nTodas as migrations foram aplicadas com sucesso.");
