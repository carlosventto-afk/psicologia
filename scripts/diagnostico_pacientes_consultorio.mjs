import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const consultorios = await client.query('select id, nome from "Consultorio" order by nome;');
console.log("Consultorios:", consultorios.rows);

const pacientes = await client.query('select id, nome, consultorio from "Paciente";');
console.log("Pacientes (id, nome, consultorio):", pacientes.rows);

await client.end();
