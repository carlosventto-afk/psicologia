import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const sessaoStatus = await client.query('select distinct status from "Sessao";');
console.log('Sessao.status valores distintos:', sessaoStatus.rows);

const contaTipo = await client.query('select distinct tipo from "ContaFinanceira";');
console.log('ContaFinanceira.tipo valores distintos:', contaTipo.rows);

const pagamentoForma = await client.query('select distinct forma_pagamento from "PagamentoSessao";');
console.log('PagamentoSessao.forma_pagamento valores distintos:', pagamentoForma.rows);

const pacoteForma = await client.query('select distinct forma_cobranca from "PacoteCobranca";');
console.log('PacoteCobranca.forma_cobranca valores distintos:', pacoteForma.rows);

await client.end();
