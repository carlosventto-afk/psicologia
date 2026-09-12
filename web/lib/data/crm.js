import { createClient } from "@/lib/supabase/server";

export async function listarLeads({ estagio } = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("Lead")
    .select("id, nome, telefone, email, estagio, origem, aguardando_humano, created_at")
    .order("created_at", { ascending: false });

  if (estagio) {
    query = query.eq("estagio", estagio);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function buscarLead(id) {
  const supabase = await createClient();

  const { data: lead, error: erroLead } = await supabase
    .from("Lead")
    .select(
      "id, nome, telefone, email, estagio, origem, usuario_id, visitante_sessao_id, aguardando_humano, created_at"
    )
    .eq("id", id)
    .single();
  if (erroLead) throw new Error(erroLead.message);

  const { data: notas, error: erroNotas } = await supabase
    .from("LeadNota")
    .select("id, texto, autor, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  if (erroNotas) throw new Error(erroNotas.message);

  return { ...lead, notas };
}
