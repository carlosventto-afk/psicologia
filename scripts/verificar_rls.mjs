import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log("=== RLS habilitado por tabela ===");
const rls = await client.query(`
  select relname, relrowsecurity
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where nspname = 'public' and relkind = 'r'
  order by relname;
`);
for (const r of rls.rows) console.log(`  ${r.relname}: ${r.relrowsecurity}`);

console.log("\n=== Default da coluna owner ===");
const defaults = await client.query(`
  select table_name, column_default
  from information_schema.columns
  where table_schema = 'public' and column_name = 'owner'
  order by table_name;
`);
for (const d of defaults.rows) console.log(`  ${d.table_name}.owner default: ${d.column_default}`);

// Pega o id_user real do único Usuario existente, pra simular RLS como "authenticated"
const { rows: usuarios } = await client.query(`select id_user from "Usuarios" limit 1;`);
const ownerUuid = usuarios[0]?.id_user;
console.log("\nid_user do usuário real de teste:", ownerUuid);

// Simula RLS como authenticated logado como esse usuário
await client.query("begin");
await client.query("set local role authenticated;");
await client.query(`select set_config('request.jwt.claims', '{"sub":"${ownerUuid}"}', true);`);

const { rows: pacientesComoOwner } = await client.query(`select count(*) from "Paciente";`);
console.log("\nPacientes visíveis logado como o owner real:", pacientesComoOwner[0].count);

await client.query("rollback");

// Simula RLS como authenticated logado como UM UUID QUALQUER (não existe)
await client.query("begin");
await client.query("set local role authenticated;");
await client.query(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);`);

const { rows: pacientesComoOutro } = await client.query(`select count(*) from "Paciente";`);
console.log("Pacientes visíveis logado como UUID aleatório (deve ser 0):", pacientesComoOutro[0].count);

// Testa insert SEM informar owner -> deve ser preenchido pelo default auth.uid()
try {
  const { rows: inserted } = await client.query(`
    insert into "ContaFinanceira" (codigo, nome, banco, agencia, numero, tipo)
    values ('TESTE_RLS', 'Conta de teste RLS', 'Banco Teste', '0001', '123456', 'corrente')
    returning id, owner;
  `);
  console.log("Insert sem owner explícito -> owner preenchido pelo default:", inserted[0].owner === ownerUuid);
  await client.query(`delete from "ContaFinanceira" where id = ${inserted[0].id};`);
} catch (err) {
  console.log("Insert de teste falhou:", err.message);
}

await client.query("rollback");

await client.end();
