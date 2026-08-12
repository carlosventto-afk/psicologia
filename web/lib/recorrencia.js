import { createClient } from "@/lib/supabase/server";

const MESES_DE_HORIZONTE = 3;

// Data alvo (yyyy-mm-dd) até onde as recorrências devem sempre ter sessões
// geradas: hoje + 3 meses. Recalculada a cada chamada, não é um valor fixo.
export function horizonteAtual() {
  const hoje = new Date();
  const alvo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + MESES_DE_HORIZONTE, hoje.getUTCDate()));
  return alvo.toISOString().slice(0, 10);
}

// Trabalha em UTC de propósito (mesmo motivo do lib/periodo-agenda.js: "data"
// no banco é um DATE puro, sem fuso).
export function calcularProximaData(dataISO, frequencia) {
  const data = new Date(`${dataISO}T00:00:00Z`);

  if (frequencia === "Mensal") {
    const dia = data.getUTCDate();
    const ano = data.getUTCFullYear();
    const mes = data.getUTCMonth();
    // Date.UTC normaliza overflow de mês sozinho (mes+2 quando mes=11 vira
    // corretamente janeiro do ano seguinte) — por isso não precisa de %12 manual.
    const ultimoDiaDoMesAlvo = new Date(Date.UTC(ano, mes + 2, 0)).getUTCDate();
    const proxima = new Date(Date.UTC(ano, mes + 1, Math.min(dia, ultimoDiaDoMesAlvo)));
    return proxima.toISOString().slice(0, 10);
  }

  const dias = frequencia === "Quinzenal" ? 14 : 7; // default Semanal
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Gera (insere) todas as sessões entre recorrencia.gerado_ate (exclusive) e
// ateISO (inclusive), e avança gerado_ate até a última data gerada.
export async function gerarSessoesAteHorizonte(recorrencia, ateISO) {
  const supabase = await createClient();

  const novasSessoes = [];
  let dataCursor = recorrencia.gerado_ate;
  let proxima = calcularProximaData(dataCursor, recorrencia.frequencia);

  while (proxima <= ateISO) {
    novasSessoes.push({
      paciente: recorrencia.paciente,
      data: proxima,
      horario: recorrencia.horario,
      duracao_min: recorrencia.duracao_min,
      tipo_sessao: recorrencia.tipo_sessao,
      status: "Marcada",
      Realizado: false,
      recorrencia_id: recorrencia.id,
    });
    dataCursor = proxima;
    proxima = calcularProximaData(dataCursor, recorrencia.frequencia);
  }

  if (novasSessoes.length > 0) {
    const { error } = await supabase.from("Sessao").insert(novasSessoes);
    if (error) throw new Error(error.message);
  }

  if (dataCursor !== recorrencia.gerado_ate) {
    const { error: erroUpdate } = await supabase
      .from("Recorrencia")
      .update({ gerado_ate: dataCursor })
      .eq("id", recorrencia.id);
    if (erroUpdate) throw new Error(erroUpdate.message);
  }

  return novasSessoes.length;
}

// "Cron preguiçoso": chamado no carregamento da Agenda/Painel. Sem scheduler
// de verdade no app ainda, então a renovação acontece na primeira tela
// visitada depois que o horizonte de uma recorrência encolhe.
export async function garantirRecorrenciasEstendidas() {
  const supabase = await createClient();
  const ateISO = horizonteAtual();

  const { data: recorrencias, error } = await supabase
    .from("Recorrencia")
    .select("id, paciente, frequencia, horario, duracao_min, tipo_sessao, data_inicio, gerado_ate, Paciente!inner(ativo)")
    .eq("ativa", true)
    .eq("Paciente.ativo", true)
    .lt("gerado_ate", ateISO);

  if (error) throw new Error(error.message);

  for (const recorrencia of recorrencias) {
    await gerarSessoesAteHorizonte(recorrencia, ateISO);
  }
}
