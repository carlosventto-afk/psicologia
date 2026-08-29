import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarResponsaveisDoPaciente(pacienteId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .select("ResponsavelFinanceiro!inner(id, nome, cpf_cnpj, telefone, email, paciente_vinculado)")
    .eq("paciente", pacienteId);

  if (error) throw new Error(error.message);

  return data.map((v) =>
    normalizarIds(
      {
        id: v.ResponsavelFinanceiro.id,
        nome: v.ResponsavelFinanceiro.nome,
        cpf_cnpj: v.ResponsavelFinanceiro.cpf_cnpj,
        telefone: v.ResponsavelFinanceiro.telefone,
        email: v.ResponsavelFinanceiro.email,
        eh_proprio: Number(v.ResponsavelFinanceiro.paciente_vinculado) === Number(pacienteId),
      },
      ["id"]
    )
  );
}

export async function listarResponsaveisParaVincular(pacienteId) {
  const supabase = await createClient();
  const { data: jaVinculados, error: erroVinculados } = await supabase
    .from("PacienteResponsavelFinanceiro")
    .select("responsavel")
    .eq("paciente", pacienteId);

  if (erroVinculados) throw new Error(erroVinculados.message);

  const idsVinculados = jaVinculados.map((v) => v.responsavel);

  let query = supabase.from("ResponsavelFinanceiro").select("id, nome").order("nome");
  if (idsVinculados.length > 0) query = query.not("id", "in", `(${idsVinculados.join(",")})`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return normalizarIdsLista(data, ["id"]);
}

export async function listarResponsaveisFinanceiros() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ResponsavelFinanceiro")
    .select("id, nome, cpf_cnpj, telefone, email, PacienteResponsavelFinanceiro(paciente)")
    .order("nome");

  if (error) throw new Error(error.message);

  return data.map((r) =>
    normalizarIds(
      {
        id: r.id,
        nome: r.nome,
        cpf_cnpj: r.cpf_cnpj,
        telefone: r.telefone,
        email: r.email,
        qtd_pacientes: r.PacienteResponsavelFinanceiro?.length ?? 0,
      },
      ["id"]
    )
  );
}

export async function buscarResponsavelFinanceiro(id) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ResponsavelFinanceiro")
    .select("id, nome, cpf_cnpj, telefone, email, PacienteResponsavelFinanceiro(Paciente(id, nome))")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  return {
    ...normalizarIds({ id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, telefone: data.telefone, email: data.email }, ["id"]),
    pacientes: normalizarIdsLista(
      (data.PacienteResponsavelFinanceiro ?? []).map((v) => v.Paciente),
      ["id"]
    ),
  };
}
