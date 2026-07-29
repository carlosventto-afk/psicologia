import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const pacientes = await client.query('select id, nome, consultorio, owner from "Paciente";');
console.log("Pacientes (id, nome, consultorio, owner):", pacientes.rows);

const usuarios = await client.query('select id_user from "Usuarios";');
console.log("id_user esperado:", usuarios.rows);

// Simula RLS como authenticated logado como o usuário real
const ownerReal = usuarios.rows[0].id_user;
await client.query("begin");
await client.query("set local role authenticated;");
await client.query(`select set_config('request.jwt.claims', '{"sub":"${ownerReal}"}', true);`);
const viaRLS = await client.query('select id, nome, consultorio from "Paciente" where consultorio = 3;');
console.log("Pacientes do consultorio 3 via RLS (logado como owner real):", viaRLS.rows);
await client.query("rollback");

await client.end();
