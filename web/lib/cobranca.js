// Logica pura de Cobranca (sem acesso a banco): saldo, elegibilidade, total,
// mapeamento de documento e intervalo do mes. As regras valem tambem no banco
// (funcoes criar_cobranca / receber_cobranca); aqui servem a tela.
// Dinheiro e somado em centavos inteiros pra evitar erro de ponto flutuante.

const paraCentavos = (v) => Math.round(Number(v ?? 0) * 100) || 0;

function saldoEmCentavos(sessao) {
  const aplicado = (sessao?.RecebimentoSessao ?? []).reduce(
    (soma, r) => soma + paraCentavos(r.valor_aplicado),
    0
  );
  return Math.max(0, paraCentavos(sessao?.valor) - aplicado);
}

export function saldoSessao(sessao) {
  return saldoEmCentavos(sessao) / 100;
}

export function sessaoElegivel(sessao) {
  if (String(sessao?.status ?? "").toLowerCase() === "cancelada") return false;
  if (sessao?.emCobrancaAtiva) return false;
  return saldoEmCentavos(sessao) > 0;
}

export function totalCobranca(sessoes) {
  return (sessoes ?? []).reduce((soma, s) => soma + saldoEmCentavos(s), 0) / 100;
}

// Valores reais da coluna Paciente.documento: 'recibo', 'nota_fiscal' ou null.
// Tambem aceita os rotulos da tela ("Receita Saúde", "Nota Fiscal", "Nenhum").
export function tipoDocumentoDoPaciente(documento) {
  const d = String(documento ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (d === "recibo" || d === "receita saude") return "recibo";
  if (d === "nota_fiscal" || d === "nota fiscal") return "nota_fiscal";
  return "nenhum";
}

// mes de 1 a 12; fim exclusivo (primeiro dia do mes seguinte).
export function intervaloDoMes(anoEntrada, mesEntrada) {
  const ano = Number(anoEntrada);
  const mes = Number(mesEntrada);
  const fmt = (a, m) => `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const inicio = fmt(ano, mes);
  const fim = mes === 12 ? fmt(ano + 1, 1) : fmt(ano, mes + 1);
  return { inicio, fim };
}

// Agrupa sessoes (ja trazidas com Paciente e RecebimentoSessao) por paciente,
// mantendo so as elegiveis. Ordena por nome do paciente.
export function agruparPendenciasPorPaciente(sessoes) {
  const porPaciente = new Map();
  for (const s of sessoes ?? []) {
    if (!sessaoElegivel(s) || !s.paciente) continue;
    let grupo = porPaciente.get(s.paciente.id);
    if (!grupo) {
      grupo = { paciente: s.paciente, sessoes: [] };
      porPaciente.set(s.paciente.id, grupo);
    }
    grupo.sessoes.push(s);
  }
  return [...porPaciente.values()]
    .map(({ paciente, sessoes: lista }) => ({
      paciente,
      qtdSessoes: lista.length,
      total: totalCobranca(lista),
      tipoDocumentoPadrao: tipoDocumentoDoPaciente(paciente.documento),
      sessaoIds: lista.map((s) => s.id),
      sessoes: lista.map((s) => ({
        id: s.id,
        data: s.data,
        horario: s.horario,
        status: s.status ?? "Marcada",
        realizada: sessaoRealizada(s),
        saldo: saldoSessao(s),
      })),
    }))
    .sort((a, b) => String(a.paciente.nome).localeCompare(String(b.paciente.nome), "pt-BR"));
}

// Mesma regra do recebimento em lote: um unico responsavel vinculado e usado
// automaticamente; com varios, o usuario precisa escolher um deles.
export function escolherResponsavel(responsaveis, escolhidoId) {
  const lista = responsaveis ?? [];
  if (lista.length === 0) {
    return { error: "Cadastre um responsável financeiro para este paciente antes de criar a cobrança." };
  }
  if (lista.length === 1) return { id: Number(lista[0].id) };
  const escolhido = lista.find((r) => Number(r.id) === Number(escolhidoId));
  if (!escolhido) return { error: "Selecione o responsável financeiro da cobrança." };
  return { id: Number(escolhido.id) };
}

const PREFIXO_ERRO = "COBRANCA: ";

// Traduz o erro do Supabase/Postgres em mensagem para o usuario.
export function mensagemErroCobranca(erro) {
  const msg = String(erro?.message ?? "");
  if (msg.startsWith(PREFIXO_ERRO)) return msg.slice(PREFIXO_ERRO.length);
  if (erro?.code === "23505") return "Algumas dessas sessões já foram incluídas em outra cobrança.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

// Sessao conta como realizada pelo status ou pela flag Realizado.
export function sessaoRealizada(sessao) {
  return String(sessao?.status ?? "").toLowerCase() === "realizada" || sessao?.Realizado === true;
}

// Ids das sessoes marcadas por padrao: so as realizadas.
export function sessoesMarcadasPorPadrao(sessoes) {
  return (sessoes ?? []).filter((s) => s.realizada).map((s) => s.id);
}

// Total (display) das sessoes marcadas; o servidor recalcula. sessoes tem { id, saldo }.
export function totalSelecionado(sessoes, idsMarcados) {
  const marcados = new Set(idsMarcados ?? []);
  const centavos = (sessoes ?? [])
    .filter((s) => marcados.has(s.id))
    .reduce((soma, s) => soma + paraCentavos(s.saldo), 0);
  return centavos / 100;
}

// Pacientes que entram no envio: marcados e com ao menos uma sessao marcada.
export function pacientesParaEnviar(pacientesMarcados, sessoesMarcadasPorPaciente) {
  return (pacientesMarcados ?? []).filter((id) => (sessoesMarcadasPorPaciente?.[id] ?? []).length > 0);
}

const MESES_ROTULO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function mesAnterior(agora = new Date()) {
  // Mes corrente em Brasilia (o servidor pode rodar em UTC).
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year").value);
  const mes = Number(partes.find((p) => p.type === "month").value);
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

// Valida o parametro ?mes=YYYY-MM estritamente; invalido cai no mes anterior.
export function mesDoParametro(param, hoje = new Date()) {
  const m = typeof param === "string" ? /^(\d{4})-(\d{2})$/.exec(param) : null;
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12) return { ano, mes };
  }
  return mesAnterior(hoje);
}

export function valorMes({ ano, mes }) {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

export function rotuloMes({ ano, mes }) {
  return `${MESES_ROTULO[mes - 1]}/${ano}`;
}
