"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";

export async function gerarRecibo(sessaoId) {
  const usuario = await buscarUsuarioAtual();
  if (!PLANOS[usuario.plano].temDocumentos) return;

  const supabase = await createClient();

  const { data: sessao, error: erroSessao } = await supabase
    .from("Sessao")
    .select("paciente, Paciente!inner(consultorio)")
    .eq("id", sessaoId)
    .single();

  if (erroSessao) return;

  await supabase.from("Recibo").insert({
    sessao: sessaoId,
    consultorio: sessao.Paciente.consultorio,
    paciente: sessao.paciente,
    data_emissao: new Date().toISOString().slice(0, 10),
  });

  revalidatePath("/recibos");
}
