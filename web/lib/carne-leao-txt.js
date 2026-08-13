export function formatarCpf(cpf) {
  return String(cpf ?? "").replace(/\D/g, "");
}

export function cpfValido(cpf) {
  return formatarCpf(cpf).length === 11;
}

export function formatarValor(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

export function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function montarDescricao(datasAtendimentoISO) {
  if (datasAtendimentoISO.length <= 1) return "Atendimento psicologico";
  const datas = datasAtendimentoISO
    .slice()
    .sort()
    .map(formatarDataBR)
    .join(", ");
  return `Atendimentos psicologicos realizados em: ${datas}`;
}

// Agrupa uma lista plana de pagamentos elegíveis em linhas de TXT,
// combinando os que compartilham o mesmo par (cpfPagador, cpfBeneficiario)
// numa única linha (valor somado, data mais recente, descrição combinada).
// Um mesmo pagador pode ter mais de um beneficiário (ex.: dois
// dependentes distintos) — por isso a chave é composta, nunca só o
// cpfPagador.
export function agruparEmLinhas(itens) {
  const porChave = new Map();
  for (const item of itens) {
    const chave = `${item.cpfPagador}|${item.cpfBeneficiario}`;
    const lista = porChave.get(chave) ?? [];
    lista.push(item);
    porChave.set(chave, lista);
  }

  const linhas = [];
  for (const subGrupo of porChave.values()) {
    const valorTotal = subGrupo.reduce((soma, i) => soma + Number(i.valor), 0);
    const dataPagamento = subGrupo.reduce(
      (maisRecente, i) => (i.dataPagamento > maisRecente ? i.dataPagamento : maisRecente),
      subGrupo[0].dataPagamento
    );
    const descricao = montarDescricao(subGrupo.map((i) => i.dataAtendimento));

    linhas.push({
      dataPagamento,
      valor: valorTotal,
      descricao,
      cpfPagador: subGrupo[0].cpfPagador,
      cpfBeneficiario: subGrupo[0].cpfBeneficiario,
    });
  }
  return linhas;
}

export function montarLinha({
  dataPagamento,
  valor,
  descricao,
  cpfPagador,
  cpfBeneficiario,
  cpfProfissional,
  crpProfissional,
}) {
  const campos = [
    formatarDataBR(dataPagamento),
    "R01.001.001",
    "255",
    formatarValor(valor),
    "",
    descricao,
    "PF",
    formatarCpf(cpfPagador),
    formatarCpf(cpfBeneficiario),
    "",
    "",
    "",
    "",
    "S",
    formatarCpf(cpfProfissional),
    crpProfissional ?? "",
  ];
  return campos.join(";");
}

export function montarArquivoTxt(linhas, profissional) {
  return linhas
    .map((linha) =>
      montarLinha({
        ...linha,
        cpfProfissional: profissional.cpf,
        crpProfissional: profissional.crp,
      })
    )
    .join("\r\n");
}
