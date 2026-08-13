import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function listarSessoesElegiveisParaRecibo() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Sessao")
    .select(
      "id, data, horario, Paciente!inner(id, nome, documento, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome)), Recibo(id)"
    )
    .eq("Realizado", true)
    .eq("Paciente.documento", "recibo")
    .order("data", { ascending: false });

  if (error) throw new Error(error.message);

  return data
    .filter((s) => (s.Recibo?.length ?? 0) === 0)
    .map((s) =>
      normalizarIds(
        {
          id: s.id,
          data: s.data,
          horario: s.horario,
          paciente_nome: s.Paciente.nome,
          paciente_dependente: s.Paciente.dependente,
          responsavel_nome: s.Paciente.ResponsavelFinanceiro?.nome ?? null,
        },
        ["id"]
      )
    );
}

export async function listarRecibosEmitidos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Recibo")
    .select(
      "id, data_emissao, Paciente(nome, dependente, ResponsavelFinanceiro:responsavel_financeiro(nome))"
    )
    .order("data_emissao", { ascending: false });

  if (error) throw new Error(error.message);

  return data.map((r) =>
    normalizarIds(
      {
        id: r.id,
        data_emissao: r.data_emissao,
        paciente_nome: r.Paciente?.nome ?? "—",
        paciente_dependente: r.Paciente?.dependente ?? false,
        responsavel_nome: r.Paciente?.ResponsavelFinanceiro?.nome ?? null,
      },
      ["id"]
    )
  );
}
