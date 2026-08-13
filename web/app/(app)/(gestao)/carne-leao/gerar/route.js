import { buscarPagamentosPorIds } from "@/lib/data/carne-leao";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { montarArquivoTxt, agruparEmLinhas, cpfValido } from "@/lib/carne-leao-txt";
import { calcularPeriodo } from "@/lib/periodo-agenda";

export async function POST(request) {
  const formData = await request.formData();
  const mes = formData.get("mes");
  const ano = formData.get("ano");

  if (!/^\d{1,2}$/.test(mes) || !/^\d{4}$/.test(ano)) {
    return new Response("Período inválido.", { status: 400 });
  }

  let grupos;
  try {
    grupos = JSON.parse(formData.get("grupos") || "[]");
  } catch {
    return new Response("Dados de agrupamento inválidos.", { status: 400 });
  }

  const usuario = await buscarUsuarioAtual();
  if (!cpfValido(usuario.cpf)) {
    return new Response("CPF do profissional não cadastrado. Preencha em /configuracoes/conta.", { status: 400 });
  }

  const { inicio: dataInicio, fim: dataFim } = calcularPeriodo("mes", `${ano}-${String(mes).padStart(2, "0")}-01`);

  const todosIds = [...new Set(grupos.flat())];
  const pagamentos = await buscarPagamentosPorIds(todosIds, { dataInicio, dataFim });
  const porId = new Map(pagamentos.map((p) => [p.pagamentoId, p]));

  const linhas = [];
  const idsConsumidos = new Set();
  for (const grupoIds of grupos) {
    // Nunca confia que o client não repetiu o mesmo id em grupos
    // diferentes — um id já usado em um grupo anterior nesta mesma
    // submissão não pode gerar uma segunda linha (senão o pagamento
    // dobra no arquivo declarado).
    const itens = grupoIds
      .filter((id) => !idsConsumidos.has(id))
      .map((id) => porId.get(id))
      .filter(Boolean);
    if (itens.length === 0) continue;

    for (const item of itens) idsConsumidos.add(item.pagamentoId);

    linhas.push(...agruparEmLinhas(itens));
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
