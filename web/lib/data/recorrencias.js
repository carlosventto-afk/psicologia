import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";
import { formatarNomePaciente } from "@/lib/formatar-nome-paciente";

export async function listarRecorrencias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Recorrencia")
    .select("id, frequencia, horario, data_inicio, gerado_ate, Paciente!inner(id, nome, apelido)")
    .eq("ativa", true)
    .order("data_inicio", { ascending: false });

  if (error) throw new Error(error.message);

  return normalizarIdsLista(
    data.map((r) => ({
      id: r.id,
      frequencia: r.frequencia,
      horario: r.horario,
      data_inicio: r.data_inicio,
      gerado_ate: r.gerado_ate,
      paciente_id: r.Paciente.id,
      paciente_nome: formatarNomePaciente(r.Paciente.nome, r.Paciente.apelido),
    })),
    ["id", "paciente_id"]
  );
}
