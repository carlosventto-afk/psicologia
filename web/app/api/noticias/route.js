import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urls = (searchParams.get("urls") ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) return Response.json({ conhecidas: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("noticias_conselhos")
    .select("url")
    .in("url", urls);

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ conhecidas: data.map((r) => r.url) });
}

export async function POST(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { fonte, url, titulo, resumo_original, publicado_em_origem, usado_em_artigo_id } = body;
  if (!fonte || !url || !titulo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  const dados = {
    fonte,
    url,
    titulo,
    resumo_original: resumo_original ?? null,
    publicado_em_origem: publicado_em_origem ?? null,
    usado_em_artigo_id: usado_em_artigo_id ?? null,
  };

  const { data, error } = await admin
    .from("noticias_conselhos")
    .upsert(dados, { onConflict: "url" })
    .select()
    .single();

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ success: true, data });
}
