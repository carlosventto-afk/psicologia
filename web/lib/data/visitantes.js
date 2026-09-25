import { createAdminClient } from "@/lib/supabase/admin";

// Mesmos hosts rastreados pelo middleware (ver proxy.js: deveRastrear) —
// lista fixa porque é definida ali, não pelos dados em si.
export const HOSTS_RASTREADOS = [
  { host: "blog.psiagente.com.br", label: "Blog" },
  { host: "busca.psiagente.com.br", label: "Diretório (busca)" },
  { host: "comece.psiagente.com.br", label: "Landing (comece)" },
  { host: "psiagente.com.br", label: "Site principal (funil)" },
];

function extrairDominioReferrer(referrer) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function ordenarPorTotalDesc(mapa, chaveNome, limite) {
  const lista = [...mapa.entries()]
    .map(([chave, total]) => ({ [chaveNome]: chave, total }))
    .sort((a, b) => b.total - a.total);
  return limite ? lista.slice(0, limite) : lista;
}

// VisitaPagina não tem RLS com policy (só service_role lê) — sempre chamar
// depois de já confirmar usuario.role === "admin" na página.
export async function estatisticasVisitantes({ dias = 30, host = "todos" } = {}) {
  const supabase = createAdminClient();
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);

  let query = supabase
    .from("VisitaPagina")
    .select("created_at, sessao_id, host, path, referrer, utm_source, utm_medium, utm_campaign")
    .gte("created_at", desde.toISOString());

  if (host !== "todos") {
    query = query.eq("host", host);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Dias pré-populados com zero pra não ter buraco na barra quando não
  // houve visita naquele dia — sem isso o gráfico fica com espaçamento
  // irregular e engana quem está lendo.
  const porDiaMap = new Map();
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    porDiaMap.set(d.toISOString().slice(0, 10), 0);
  }

  const sessoes = new Set();
  const porPaginaMap = new Map();
  const porReferrerMap = new Map();
  const porUtmMap = new Map();
  const porHostMap = new Map();

  for (const linha of data) {
    sessoes.add(linha.sessao_id);

    const dia = linha.created_at.slice(0, 10);
    porDiaMap.set(dia, (porDiaMap.get(dia) ?? 0) + 1);

    porPaginaMap.set(linha.path, (porPaginaMap.get(linha.path) ?? 0) + 1);
    porHostMap.set(linha.host, (porHostMap.get(linha.host) ?? 0) + 1);

    const origem = extrairDominioReferrer(linha.referrer) ?? "Direto / desconhecido";
    porReferrerMap.set(origem, (porReferrerMap.get(origem) ?? 0) + 1);

    if (linha.utm_source) {
      const chave = [linha.utm_source, linha.utm_medium, linha.utm_campaign].filter(Boolean).join(" / ");
      porUtmMap.set(chave, (porUtmMap.get(chave) ?? 0) + 1);
    }
  }

  const porDia = [...porDiaMap.entries()]
    .map(([data_, total]) => ({ data: data_, total }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    totalPageviews: data.length,
    sessoesUnicas: sessoes.size,
    paginasUnicas: porPaginaMap.size,
    porDia,
    topPaginas: ordenarPorTotalDesc(porPaginaMap, "path", 10),
    topReferrers: ordenarPorTotalDesc(porReferrerMap, "origem", 10),
    topCampanhas: ordenarPorTotalDesc(porUtmMap, "utm", 10),
    porHost: ordenarPorTotalDesc(porHostMap, "host"),
  };
}
