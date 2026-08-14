import { calcularPeriodo, deslocarData } from "@/lib/periodo-agenda";

function diaSeguinte(dataISO) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + 1);
  return data.toISOString().slice(0, 10);
}

function diasCorridosDesde(dataISO, hojeISO) {
  const a = new Date(`${dataISO}T00:00:00Z`);
  const b = new Date(`${hojeISO}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

// Decide se um profissional está "na data" de receber um envio
// automático, dada a frequência configurada e a data do último envio
// bem-sucedido. Nunca enviou ainda → sempre está na data (primeira vez).
export function estaNaData(frequencia, ultimoEnvio, hojeISO) {
  if (!ultimoEnvio) return true;

  if (frequencia === "mensal") {
    const [anoUlt, mesUlt] = ultimoEnvio.split("-");
    const [anoHoje, mesHoje, diaHoje] = hojeISO.split("-");
    const mudouDeMes = anoUlt !== anoHoje || mesUlt !== mesHoje;
    // Dá uma margem de 2 dias no início do mês pra pagamentos registrados
    // com atraso nos primeiros dias entrarem no envio do mês anterior.
    return mudouDeMes && Number(diaHoje) >= 3;
  }

  const dias = diasCorridosDesde(ultimoEnvio, hojeISO);
  if (frequencia === "quinzenal") return dias >= 14;
  return dias >= 7; // semanal
}

// Calcula o período (inicio/fim, yyyy-mm-dd) a ser coberto por um envio
// automático. Mensal sempre cobre o mês anterior completo. Semanal e
// quinzenal cobrem o delta desde o último envio, nunca cruzando virada de
// mês: o período fica sempre dentro do mês de "inicio" (nunca estende pro
// mês corrente se "inicio" ainda está no mês anterior) — é assim que
// evitamos duplicidade E evitamos perder silenciosamente os últimos dias
// de um mês, sem depender de marcar pagamento como "já exportado" (item
// 10 do backlog, ainda não implementado). Se o delta cobrir só o final do
// mês anterior, o pedaço do mês corrente fica pro próximo ciclo
// automaticamente (a próxima chamada calcula um novo "inicio" a partir do
// "fim" deste envio).
export function periodoParaEnvio(frequencia, ultimoEnvio, hojeISO) {
  if (frequencia === "mensal") {
    const primeiroDiaMesCorrente = calcularPeriodo("mes", hojeISO).inicio;
    const mesAnteriorBase = deslocarData(primeiroDiaMesCorrente, "mes", -1);
    return calcularPeriodo("mes", mesAnteriorBase);
  }

  const inicio = ultimoEnvio ? diaSeguinte(ultimoEnvio) : calcularPeriodo("mes", hojeISO).inicio;
  const fimDoMesDoInicio = calcularPeriodo("mes", inicio).fim;
  const fim = hojeISO < fimDoMesDoInicio ? hojeISO : fimDoMesDoInicio;
  return { inicio, fim };
}
