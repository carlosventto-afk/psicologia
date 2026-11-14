"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailResend, EMAIL_ADMIN } from "@/lib/email/resend";
import { compararCenarios } from "@/lib/comparativo/comparar";
import { validarContato } from "@/lib/comparativo/contato";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTULOS = {
  aluguel: "Aluguel",
  supervisao: "Supervisão",
  contas: "Contas",
  material: "Material",
  outros: "Outros",
};
const MELHOR = { pj: "Simples Nacional (PJ)", pf: "Carnê-Leão (PF)", empate: "Empate" };

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarResumo({ faturamento, despesasPorCategoria, contador }, resultado) {
  const despesas = Object.entries(ROTULOS)
    .map(([k, rotulo]) => `${rotulo}: ${brl(despesasPorCategoria?.[k] ?? 0)}`)
    .join("; ");
  return [
    "Comparativo PF x PJ",
    `Faturamento mensal: ${brl(faturamento)}`,
    `Despesas: ${despesas}`,
    contador != null ? `Contador: ${brl(contador)}` : null,
    `Líquido PF (Carnê-Leão): ${brl(resultado.pf.liquido)}`,
    `Líquido PJ (Simples Nacional): ${brl(resultado.pj.liquido)}`,
    `Melhor opção: ${MELHOR[resultado.melhor]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const escapaHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Retorno do honeypot: { ok: true, resultado: null } (nada gravado).
export async function capturarLeadComparativo(entrada = {}) {
  if (entrada.site) {
    return { ok: true, resultado: null };
  }

  const contato = validarContato(entrada);
  if (!contato.ok) return contato;

  const resultado = compararCenarios({
    faturamento: entrada.faturamento,
    despesasPorCategoria: entrada.despesasPorCategoria,
    contador: entrada.contador,
  });
  if (!resultado.ok) return resultado;

  const { nome, whatsapp, email } = contato.valor;
  const resumo = montarResumo(entrada, resultado);

  // Melhor esforço: falha aqui nunca impede o visitante de ver o resultado.
  try {
    const cookieStore = await cookies();
    const pv = cookieStore.get("pv_id")?.value;
    const admin = createAdminClient();
    const { data: lead, error } = await admin
      .from("Lead")
      .insert({
        nome,
        telefone: whatsapp,
        email,
        visitante_sessao_id: pv && UUID_RE.test(pv) ? pv : null,
        estagio: "novo",
        origem: "comparativo",
      })
      .select("id")
      .single();
    if (!error && lead) {
      await admin.from("LeadNota").insert({ lead_id: lead.id, texto: resumo });
    }
  } catch {}

  enviarEmailResend({
    to: EMAIL_ADMIN,
    subject: `Novo lead do comparativo PF x PJ: ${nome}`,
    html: `<p><strong>Nome:</strong> ${escapaHtml(nome)}</p>
      <p><strong>WhatsApp:</strong> ${escapaHtml(whatsapp)}</p>
      <p><strong>E-mail:</strong> ${escapaHtml(email)}</p>
      <pre>${escapaHtml(resumo)}</pre>`,
  }).catch(() => {});

  return { ok: true, resultado };
}
