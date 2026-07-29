import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const def = await client.query(`select pg_get_viewdef('v_resumo_financeiro_mensal', true) as def;`);
console.log("Definição da view:\n", def.rows[0].def);

const rows = await client.query(`select * from v_resumo_financeiro_mensal limit 5;`);
console.log("\nLinhas existentes:", rows.rows);

const lanc = await client.query(`select * from "LancamentoFinanceiro" limit 5;`);
console.log("\nLancamentoFinanceiro existentes:", lanc.rows);

await client.end();
