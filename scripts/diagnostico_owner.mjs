import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// Confirma se Consultorio.owner == Usuarios.id_user (sem expor valores reais)
const r1 = await client.query(`
  select count(*) as total_consultorios,
         count(u.id) as com_match_em_usuarios
  from "Consultorio" c
  left join "Usuarios" u on u.id_user = c.owner;
`);
console.log("Consultorio.owner casa com Usuarios.id_user?", r1.rows[0]);

const r2 = await client.query(`select count(*) as total from "Consultorio";`);
const r3 = await client.query(`select count(*) as total from "Usuarios";`);
const r4 = await client.query(`select count(*) as total from "Paciente";`);
const r5 = await client.query(`select count(*) as total from "Sessao";`);
console.log("Totais:", { consultorios: r2.rows[0].total, usuarios: r3.rows[0].total, pacientes: r4.rows[0].total, sessoes: r5.rows[0].total });

// distribuição de owner por consultório (quantos consultórios por owner) - sem expor uuid
const r6 = await client.query(`
  select owner, count(*) as qtd_consultorios
  from "Consultorio"
  group by owner;
`);
console.log("Qtd consultórios por owner (uuid ofuscado):", r6.rows.map(r => r.qtd_consultorios));

// contato: só tipo de dado / faixa de dígitos, sem expor o número
const r7 = await client.query(`
  select min(length(contato::text)) as min_len, max(length(contato::text)) as max_len, count(*) as total
  from "Usuarios" where contato is not null;
`);
console.log("Usuarios.contato (comprimento em dígitos):", r7.rows[0]);

await client.end();
