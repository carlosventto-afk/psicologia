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
// mês (capado no início/fim do mês corrente) — é assim que evitamos
// duplicidade entre envios automáticos sem depender de marcar pagamento
// como "já exportado" (item 10 do backlog, ainda não implementado).
export function periodoParaEnvio(frequencia, ultimoEnvio, hojeISO) {
  if (frequencia === "mensal") {
    const primeiroDiaMesCorrente = calcularPeriodo("mes", hojeISO).inicio;
    const mesAnteriorBase = deslocarData(primeiroDiaMesCorrente, "mes", -1);
    return calcularPeriodo("mes", mesAnteriorBase);
  }

  const mesCorrente = calcularPeriodo("mes", hojeISO);
  const inicioDelta = ultimoEnvio ? diaSeguinte(ultimoEnvio) : mesCorrente.inicio;
  const inicio = inicioDelta > mesCorrente.inicio ? inicioDelta : mesCorrente.inicio;
  const fim = hojeISO < mesCorrente.fim ? hojeISO : mesCorrente.fim;
  return { inicio, fim };
}
