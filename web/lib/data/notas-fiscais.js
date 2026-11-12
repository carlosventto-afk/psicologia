import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { recebimentosComEmissaoPorCobranca } from "@/lib/nota-fiscal";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

const SELECT_RECEBIMENTO_SESSAO =
  "id, valor_aplicado, Recebimento!inner(id, data_recebimento), Sessao!inner(id, data, Paciente!inner(id, nome, apelido, email, cpf, documento)), NotaFiscal(id, status)";

// pagamentoId aqui e o id de RecebimentoSessao (nao mais PagamentoSessao) —
// nome mantido por estabilidade de contrato com emitirNotaFiscal(pagamentoId, ...).
export async function listarPagamentosElegiveisParaNotaFiscal() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("RecebimentoSessao")
    .select(SELECT_RECEBIMENTO_SESSAO)
    .eq("Sessao.Paciente.documento", "nota_fiscal")
    .order("data_recebimento", { referencedTable: "Recebimento", ascending: false });

  if (error) throw new Error(error.message);

  // Rateios de recebimento de cobrança com emissão por cobrança: a nota sai pela
  // cobrança (automática ou botão da cobrança), nunca um a um aqui. Uma consulta só.
  const recebimentoIds = [...new Set((data ?? []).map((p) => Number(p.Recebimento.id)))];
  let porCobranca = new Set();
  if (recebimentoIds.length > 0) {
    const { data: cobrancas, error: erroCobrancas } = await supabase
      .from("Cobranca")
      .select("recebimento, tipo_documento, emissao_por")
      .in("recebimento", recebimentoIds);
    if (erroCobrancas) throw new Error(erroCobrancas.message);
    porCobranca = recebimentosComEmissaoPorCobranca(cobrancas);
  }

  return normalizarIdsLista(data, ["id"])
    .filter((p) => !porCobranca.has(Number(p.Recebimento.id)))
    .filter((p) => !(p.NotaFiscal ?? []).some((n) => n.status === "pendente" || n.status === "autorizada"))
    .map((p) => ({
      pagamentoId: p.id,
      valor: p.valor_aplicado,
      dataPagamento: p.Recebimento.data_recebimento,
      dataSessao: p.Sessao.data,
      pacienteNome: formatarNomePaciente(p.Sessao.Paciente.nome, p.Sessao.Paciente.apelido),
      pacienteCpf: p.Sessao.Paciente.cpf,
      pacienteEmail: p.Sessao.Paciente.email,
    }));
}

// Notas antigas (emitidas antes desta migração) continuam ligadas via
// PagamentoSessao; notas novas via RecebimentoSessao. Exibidas juntas,
// mais recentes primeiro.
export async function listarNotasFiscaisEmitidas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("NotaFiscal")
    .select(
      "id, status, numero, serie, chave_acesso, ambiente, erros, ultimo_erro, created_at, cobranca, Cobranca(valor_total, Paciente(nome, apelido)), PagamentoSessao(valor, Sessao(Paciente(nome, apelido))), RecebimentoSessao(valor_aplicado, Sessao(Paciente(nome, apelido)))"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((n) => {
    const viaRecebimento = n.RecebimentoSessao;
    const viaPagamento = n.PagamentoSessao;
    // Nota de cobrança: paciente e valor vêm da cobrança.
    const viaCobranca = n.Cobranca;
    const paciente =
      viaRecebimento?.Sessao?.Paciente ?? viaPagamento?.Sessao?.Paciente ?? viaCobranca?.Paciente ?? null;
    return {
      id: n.id,
      status: n.status,
      numero: n.numero,
      serie: n.serie,
      chaveAcesso: n.chave_acesso,
      ambiente: n.ambiente,
      erros: n.erros,
      ultimoErro: n.ultimo_erro,
      daCobranca: n.cobranca != null,
      criadoEm: n.created_at,
      valor: viaRecebimento?.valor_aplicado ?? viaPagamento?.valor ?? viaCobranca?.valor_total,
      pacienteNome: paciente ? formatarNomePaciente(paciente.nome, paciente.apelido) : "—",
    };
  });
}
