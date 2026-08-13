import { buscarPagamentosPorIds } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { montarDescricao, montarArquivoTxt } from "@/lib/carne-leao-txt";

export async function POST(request) {
  const formData = await request.formData();
  const mes = formData.get("mes");
  const ano = formData.get("ano");

  let grupos;
  try {
    grupos = JSON.parse(formData.get("grupos") || "[]");
  } catch {
    return new Response("Dados de agrupamento inválidos.", { status: 400 });
  }

  const usuario = await buscarUsuarioAtual();
  if (!usuario.cpf) {
    return new Response("CPF do profissional não cadastrado. Preencha em /configuracoes/conta.", { status: 400 });
  }

  const todosIds = [...new Set(grupos.flat())];
  const pagamentos = await buscarPagamentosPorIds(todosIds);
  const porId = new Map(pagamentos.map((p) => [p.pagamentoId, p]));

  const linhas = [];
  for (const grupoIds of grupos) {
    const itens = grupoIds.map((id) => porId.get(id)).filter(Boolean);
    if (itens.length === 0) continue;

    // Nunca confia no agrupamento do client — reagrupa por CPF do
    // pagador real (vindo do banco) antes de montar cada linha.
    const porPagador = new Map();
    for (const item of itens) {
      const lista = porPagador.get(item.cpfPagador) ?? [];
      lista.push(item);
      porPagador.set(item.cpfPagador, lista);
    }

    for (const subGrupo of porPagador.values()) {
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
  }

  if (linhas.length === 0) {
    return new Response("Nenhum pagamento válido para gerar o arquivo.", { status: 400 });
  }

  const conteudo = montarArquivoTxt(linhas, usuario);
  const nomeArquivo = `carne-leao-${String(mes).padStart(2, "0")}-${ano}.txt`;

  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
