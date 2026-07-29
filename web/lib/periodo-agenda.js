export function paraISO(date) {
  return date.toISOString().slice(0, 10);
}

// Trabalha em UTC de propósito: "data" no banco é um DATE puro (sem hora/fuso),
// então tratamos a string yyyy-mm-dd como UTC para não ter erro de +/-1 dia
// dependendo do fuso do servidor.
export function calcularPeriodo(visao, dataBaseStr) {
  const dataBase = new Date(`${dataBaseStr}T00:00:00Z`);

  if (visao === "semana") {
    const diaDaSemana = dataBase.getUTCDay(); // 0 = domingo
    const offsetSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const inicio = new Date(dataBase);
    inicio.setUTCDate(inicio.getUTCDate() + offsetSegunda);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 6);
    return { inicio: paraISO(inicio), fim: paraISO(fim) };
  }

  if (visao === "mes") {
    const inicio = new Date(Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth(), 1));
    const fim = new Date(Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth() + 1, 0));
    return { inicio: paraISO(inicio), fim: paraISO(fim) };
  }

  return { inicio: dataBaseStr, fim: dataBaseStr };
}

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// dataISO é um DATE puro (yyyy-mm-dd) — tratado como UTC pelo mesmo motivo
// de calcularPeriodo, pra não errar o dia por causa do fuso do servidor.
export function diaDaSemanaAbreviado(dataISO) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  return DIAS_SEMANA[data.getUTCDay()];
}

export function enumerarDatas(inicioISO, fimISO) {
  const datas = [];
  const cursor = new Date(`${inicioISO}T00:00:00Z`);
  const fim = new Date(`${fimISO}T00:00:00Z`);
  while (cursor <= fim) {
    datas.push(paraISO(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return datas;
}

// Grade de semanas (segunda a domingo) cobrindo o mês inteiro, incluindo os
// dias de padding do mês anterior/seguinte que completam a primeira/última
// semana — igual ao layout tradicional de calendário mensal.
export function calcularGradeMes(dataBaseStr) {
  const dataBase = new Date(`${dataBaseStr}T00:00:00Z`);
  const inicioMes = new Date(Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth(), 1));
  const fimMes = new Date(Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth() + 1, 0));

  const offsetInicio = inicioMes.getUTCDay() === 0 ? 6 : inicioMes.getUTCDay() - 1;
  const inicioGrade = new Date(inicioMes);
  inicioGrade.setUTCDate(inicioGrade.getUTCDate() - offsetInicio);

  const offsetFim = fimMes.getUTCDay() === 0 ? 0 : 7 - fimMes.getUTCDay();
  const fimGrade = new Date(fimMes);
  fimGrade.setUTCDate(fimGrade.getUTCDate() + offsetFim);

  const mesAtual = dataBase.getUTCMonth();
  const semanas = [];
  let semana = [];
  const cursor = new Date(inicioGrade);
  while (cursor <= fimGrade) {
    semana.push({ data: paraISO(cursor), noMes: cursor.getUTCMonth() === mesAtual });
    if (semana.length === 7) {
      semanas.push(semana);
      semana = [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return semanas;
}

// Move a data-base pra frente/trás de acordo com a visão ativa (1 dia, 7
// dias, ou 1 mês) — usado pelos botões "‹ ›" de navegação da Agenda.
export function deslocarData(dataISO, visao, direcao) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  if (visao === "semana") {
    data.setUTCDate(data.getUTCDate() + 7 * direcao);
  } else if (visao === "mes") {
    data.setUTCMonth(data.getUTCMonth() + direcao);
  } else {
    data.setUTCDate(data.getUTCDate() + direcao);
  }
  return paraISO(data);
}

export function formatarRotuloPeriodo(visao, dataBaseISO, inicioISO, fimISO) {
  const dataBase = new Date(`${dataBaseISO}T00:00:00Z`);

  if (visao === "mes") {
    const rotulo = dataBase.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
  }

  if (visao === "semana") {
    const formatar = (iso) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      });
    return `${formatar(inicioISO)} – ${formatar(fimISO)}`;
  }

  const rotulo = dataBase.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}
