"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailResend, EMAIL_ADMIN } from "@/lib/email/resend";
import { compararCenarios } from "@/lib/comparativo/comparar";
import { validarContato } from "@/lib/comparativo/contato";
import { acharDuplicado, limiteDuplicidade } from "@/lib/comparativo/duplicidade";

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

function montarResumo({ faturamento, despesas }, resultado) {
  const detalhe = Object.entries(ROTULOS)
    .map(([k, rotulo]) => `${rotulo}: ${brl(despesas[k])}`)
    .join("; ");
  return [
    "Comparativo PF x PJ",
    `Faturamento mensal: ${brl(faturamento)}`,
    `Despesas: ${detalhe}`,
    `Contador: ${brl(resultado.pj.contador)}`,
    `Líquido PF (Carnê-Leão): ${brl(resultado.pf.liquido)}`,
    `Líquido PJ (Simples Nacional): ${brl(resultado.pj.liquido)}`,
    `Melhor opção: ${MELHOR[resultado.melhor]}`,
  ].join("\n");
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
  // Valores já validados por compararCenarios (despesas ausentes valem zero).
  const despesas = Object.fromEntries(
    Object.keys(ROTULOS).map((k) => [k, entrada.despesasPorCategoria?.[k] ?? 0]),
  );
  const resumo = montarResumo({ faturamento: entrada.faturamento, despesas }, resultado);

  // Melhor esforço: falha aqui nunca impede o visitante de ver o resultado.
  let novoLead = true;
  try {
    const cookieStore = await cookies();
    const pv = cookieStore.get("pv_id")?.value;
    const sessaoId = pv && UUID_RE.test(pv) ? pv : null;
    const admin = createAdminClient();

    const filtro = [`telefone.eq.${whatsapp}`, sessaoId && `visitante_sessao_id.eq.${sessaoId}`]
      .filter(Boolean)
      .join(",");
    const { data: recentes, error: erroBusca } = await admin
      .from("Lead")
      .select("id, telefone, visitante_sessao_id, created_at")
      .eq("origem", "comparativo")
      .gte("created_at", limiteDuplicidade(new Date()))
      .or(filtro);
    if (erroBusca) console.error("[comparativo] falha ao buscar lead recente:", erroBusca.message);
    const duplicado = erroBusca ? null : acharDuplicado(recentes, { telefone: whatsapp, sessaoId });

    if (duplicado) {
      novoLead = false;
      const { error } = await admin
        .from("LeadNota")
        .insert({ lead_id: duplicado.id, texto: resumo, autor: "lead" });
      if (error) console.error("[comparativo] falha ao gravar nota:", error.message);
    } else {
      const { data: lead, error } = await admin
        .from("Lead")
        .insert({
          nome,
          telefone: whatsapp,
          email,
          visitante_sessao_id: sessaoId,
          estagio: "novo",
          origem: "comparativo",
        })
        .select("id")
        .single();
      if (error || !lead) {
        console.error("[comparativo] falha ao gravar lead:", error?.message);
      } else {
        const { error: erroNota } = await admin
          .from("LeadNota")
          .insert({ lead_id: lead.id, texto: resumo, autor: "lead" });
        if (erroNota) console.error("[comparativo] falha ao gravar nota:", erroNota.message);
      }
    }
  } catch (e) {
    console.error("[comparativo] falha ao gravar lead:", e?.message);
  }

  if (novoLead) {
    enviarEmailResend({
      to: EMAIL_ADMIN,
      subject: `Novo lead do comparativo PF x PJ: ${nome}`,
      html: `<p><strong>Nome:</strong> ${escapaHtml(nome)}</p>
      <p><strong>WhatsApp:</strong> ${escapaHtml(whatsapp)}</p>
      <p><strong>E-mail:</strong> ${escapaHtml(email)}</p>
      <pre>${escapaHtml(resumo)}</pre>`,
    }).catch((e) => console.error("[comparativo] falha ao enviar e-mail:", e?.message));
  }

  return { ok: true, resultado };
}
