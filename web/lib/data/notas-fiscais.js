import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

const SELECT_PAGAMENTO =
  "id, valor, data_pagamento, Sessao!inner(id, data, Paciente!inner(id, nome, email, cpf, documento)), NotaFiscal(id, status)";

export async function listarPagamentosElegiveisParaNotaFiscal() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PagamentoSessao")
    .select(SELECT_PAGAMENTO)
    .eq("Sessao.Paciente.documento", "nota_fiscal")
    .order("data_pagamento", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"])
    .filter((p) => !(p.NotaFiscal ?? []).some((n) => n.status === "pendente" || n.status === "autorizada"))
    .map((p) => ({
      pagamentoId: p.id,
      valor: p.valor,
      dataPagamento: p.data_pagamento,
      dataSessao: p.Sessao.data,
      pacienteNome: p.Sessao.Paciente.nome,
      pacienteCpf: p.Sessao.Paciente.cpf,
      pacienteEmail: p.Sessao.Paciente.email,
    }));
}

export async function listarNotasFiscaisEmitidas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("NotaFiscal")
    .select(
      "id, status, numero, serie, chave_acesso, ambiente, erros, created_at, PagamentoSessao(valor, Sessao(Paciente(nome)))"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]).map((n) => ({
    id: n.id,
    status: n.status,
    numero: n.numero,
    serie: n.serie,
    chaveAcesso: n.chave_acesso,
    ambiente: n.ambiente,
    erros: n.erros,
    criadoEm: n.created_at,
    valor: n.PagamentoSessao?.valor,
    pacienteNome: n.PagamentoSessao?.Sessao?.Paciente?.nome ?? "—",
  }));
}
