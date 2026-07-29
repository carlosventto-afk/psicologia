import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL antes de rodar este script.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const db = await client.query("select current_database() as db, current_user as usr;");
console.log("current_database/current_user:", db.rows);

const schemas = await client.query("select schema_name from information_schema.schemata order by schema_name;");
console.log("schemas:", schemas.rows.map((r) => r.schema_name));

try {
  const authUsers = await client.query("select count(*) from auth.users;");
  console.log("auth.users count:", authUsers.rows[0].count);
} catch (e) {
  console.log("erro ao consultar auth.users:", e.message);
}

await client.end();
