import { createAdminClient } from "@/lib/supabase/admin";

const POR_PAGINA = 50;

// leads_cfp está com RLS deny-all (nem "authenticated" lê) — precisa do
// client service-role. Só é chamado por páginas que já verificaram
// usuario.role === "admin" antes.
export async function listarLeadsCfp({ busca = "", pagina = 1 } = {}) {
  const supabase = createAdminClient();
  const de = (pagina - 1) * POR_PAGINA;
  const ate = de + POR_PAGINA - 1;

  let query = supabase
    .from("leads_cfp")
    .select("crp_regiao, crp_registro, nome, situacao, data_inscricao", { count: "exact" })
    .eq("situacao", "ATIVO")
    .order("nome", { ascending: true })
    .range(de, ate);

  if (busca) {
    query = query.ilike("nome", `%${busca}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    leads: data,
    total: count ?? 0,
    pagina,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA)),
  };
}
