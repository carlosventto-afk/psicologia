import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: usuarios } = await client.query(`select id_user, email from "Usuarios";`);
const ownerReal = usuarios[0].id_user;

const { rows: authUsers } = await client.query(`select id, email from auth.users where id != $1;`, [ownerReal]);
const outroUsuarioValido = authUsers[0]?.id;
console.log("Owner real (logado):", ownerReal);
console.log("Outro auth.users válido (não é o logado):", outroUsuarioValido);

// Teste 1: insert SEM owner explícito, logado como o dono real -> default deve preencher com o próprio uid
await client.query("begin");
await client.query("set local role authenticated;");
await client.query(`select set_config('request.jwt.claims', '{"sub":"${ownerReal}"}', true);`);

try {
  const { rows } = await client.query(`
    insert into "ContaFinanceira" (codigo, nome, banco, agencia, numero, tipo)
    values ('TESTE_RLS_1', 'Conta teste 1', 'Banco Teste', '0001', '111111', 'corrente')
    returning id, owner;
  `);
  console.log("\nTeste 1 (insert sem owner, logado como dono real):");
  console.log("  owner preenchido pelo default:", rows[0].owner);
  console.log("  bate com o uid logado?", rows[0].owner === ownerReal);
} catch (err) {
  console.log("\nTeste 1 falhou (não deveria falhar):", err.message);
}
await client.query("rollback");

// Teste 2: insert tentando FORÇAR owner de outro usuário válido, logado como o dono real
// -> RLS (with check owner = auth.uid()) deve BLOQUEAR, mesmo o outro uuid sendo um auth.users real
await client.query("begin");
await client.query("set local role authenticated;");
await client.query(`select set_config('request.jwt.claims', '{"sub":"${ownerReal}"}', true);`);

try {
  await client.query(
    `insert into "ContaFinanceira" (codigo, nome, banco, agencia, numero, tipo, owner)
     values ('TESTE_RLS_2', 'Conta teste 2', 'Banco Teste', '0002', '222222', 'corrente', $1);`,
    [outroUsuarioValido]
  );
  console.log("\nTeste 2 (insert com owner de OUTRO usuário válido): NÃO foi bloqueado — FALHA DE SEGURANÇA!");
} catch (err) {
  console.log("\nTeste 2 (insert com owner de OUTRO usuário válido): bloqueado corretamente.");
  console.log("  erro:", err.message);
}
await client.query("rollback");

await client.end();
