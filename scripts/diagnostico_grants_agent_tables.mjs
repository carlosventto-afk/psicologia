import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const tabelas = ["agent_audit_log", "agent_sessions", "lembretes_enviados", "whatsapp_verificacao_codigos"];

const r = await client.query(`
  select table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any($1)
    and grantee in ('anon', 'authenticated')
  order by table_name, grantee, privilege_type;
`, [tabelas]);

if (r.rows.length === 0) {
  console.log("Nenhum grant de anon/authenticated encontrado nessas tabelas — acesso já é restrito por padrão.");
} else {
  console.log("Grants encontrados (isso precisa ser revogado):");
  for (const row of r.rows) console.log(`  ${row.table_name}: ${row.grantee} -> ${row.privilege_type}`);
}

await client.end();
