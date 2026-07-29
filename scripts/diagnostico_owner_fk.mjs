import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// A que tabela a FK de owner realmente aponta?
const fk = await client.query(`
  select
    tc.table_name, kcu.column_name,
    ccu.table_schema as foreign_schema, ccu.table_name as foreign_table, ccu.column_name as foreign_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'owner';
`);
console.log("FKs na coluna owner:", fk.rows);

// O id_user cadastrado em Usuarios existe em auth.users?
const usuarios = await client.query(`select id, id_user, email, role from "Usuarios";`);
console.log("\nUsuarios cadastrados (id, id_user, role):", usuarios.rows.map(r => ({ id: r.id, id_user: r.id_user, role: r.role })));

for (const u of usuarios.rows) {
  const check = await client.query(`select count(*) from auth.users where id = $1;`, [u.id_user]);
  console.log(`id_user ${u.id_user} existe em auth.users?`, check.rows[0].count > 0);
}

const authUsers = await client.query(`select id, email from auth.users;`);
console.log("\nauth.users existentes (id, email):", authUsers.rows);

await client.end();
