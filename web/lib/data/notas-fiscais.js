import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

const SELECT_RECEBIMENTO_SESSAO =
  "id, valor_aplicado, Recebimento!inner(data_recebimento), Sessao!inner(id, data, Paciente!inner(id, nome, apelido, email, cpf, documento)), NotaFiscal(id, status)";

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

  return normalizarIdsLista(data, ["id"])
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
      "id, status, numero, serie, chave_acesso, ambiente, erros, created_at, PagamentoSessao(valor, Sessao(Paciente(nome, apelido))), RecebimentoSessao(valor_aplicado, Sessao(Paciente(nome, apelido)))"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((n) => {
    const viaRecebimento = n.RecebimentoSessao;
    const viaPagamento = n.PagamentoSessao;
    const paciente = viaRecebimento?.Sessao?.Paciente ?? viaPagamento?.Sessao?.Paciente ?? null;
    return {
      id: n.id,
      status: n.status,
      numero: n.numero,
      serie: n.serie,
      chaveAcesso: n.chave_acesso,
      ambiente: n.ambiente,
      erros: n.erros,
      criadoEm: n.created_at,
      valor: viaRecebimento?.valor_aplicado ?? viaPagamento?.valor,
      pacienteNome: paciente ? formatarNomePaciente(paciente.nome, paciente.apelido) : "—",
    };
  });
}
