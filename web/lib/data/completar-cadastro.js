import { createClient } from "@/lib/supabase/server";

export async function buscarDadosCompletarCadastro(token) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buscar_dados_completar_cadastro", { p_token: token });

  if (error) return null;
  return data;
}

const CAMPOS_SELECT =
  "id, status, telefone_pendente, email_pendente, endereco_pendente, cpf_pendente, rg_numero_pendente, rg_data_expedicao_pendente, rg_orgao_emissor_pendente, criado_em, decidido_em";

export async function buscarPropostaAtiva(pacienteId) {
  const supabase = await createClient();

  const { data: ultima, error } = await supabase
    .from("PropostaCompletarCadastro")
    .select(CAMPOS_SELECT)
    .eq("paciente_id", pacienteId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ultima || ultima.status === "aceita") return null;
  if (ultima.status === "pendente") return ultima;

  // rejeitada: só dentro dos 60 dias
  const prazo = new Date(ultima.criado_em);
  prazo.setDate(prazo.getDate() + 60);
  if (new Date() > prazo) return null;

  return { ...ultima, prazoAceite: prazo.toISOString() };
}
