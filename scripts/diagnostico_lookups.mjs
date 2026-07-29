import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const ta = await client.query('select * from "TipoAtendimento" order by "Codigo";');
const tc = await client.query('select * from "TipoCobranca" order by "Codigo";');
console.log("TipoAtendimento:", ta.rows);
console.log("TipoCobranca:", tc.rows);

const pac = await client.query(
  'select id, nome, dimensao_atendimento, dimensao_cobranca, forma_cobranca, valor_sugerido from "PacoteCobranca";'
);
console.log("PacoteCobranca existentes:", pac.rows);

await client.end();
