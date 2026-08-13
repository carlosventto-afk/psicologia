export function formatarCpf(cpf) {
  return String(cpf ?? "").replace(/\D/g, "");
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
