// web/scripts/gerar-planilha-modelo-pacientes.mjs
//
// Gera a planilha modelo estática servida em
// /planilha-modelo-pacientes.xlsx. Rodar de novo só se as colunas do
// mapeamento de importação mudarem — não é executado em runtime.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destino = path.resolve(__dirname, "../public/planilha-modelo-pacientes.xlsx");

const cabecalho = [
  "Nome",
  "Data de Nascimento",
  "Telefone",
  "E-mail",
  "Endereço",
  "Valor da Sessão",
  "Observações",
  "Precisa de recibo",
];

const exemplo = [
  "Maria da Silva",
  "15/03/1990",
  "(11) 91234-5678",
  "maria.silva@email.com",
  "Rua das Flores, 123 - São Paulo/SP",
  "150",
  "Paciente encaminhada pelo Dr. João",
  "Sim",
];

const planilha = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
planilha["!cols"] = cabecalho.map(() => ({ wch: 24 }));

const livro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(livro, planilha, "Pacientes");

const buffer = XLSX.write(livro, { bookType: "xlsx", type: "buffer" });
fs.writeFileSync(destino, buffer);
console.log(`Planilha modelo gerada em ${destino}`);
