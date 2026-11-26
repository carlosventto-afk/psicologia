import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buscarArtigoPublicadoPorSlug } from "@/lib/data/artigos";
import { ALTURA, LARGURA, cartaoArtigo } from "@/lib/cartao-og";
import { origens } from "@/lib/seo";

// Cartão 1200x630 com o título do artigo, para o compartilhamento (WhatsApp,
// LinkedIn, X...) de artigos que não têm capa. Visto em
// blog.psiagente.com.br/<slug>/imagem-compartilhamento (o proxy prefixa /blog).

// A fonte vem de public/ porque é a pasta que o Dockerfile copia inteira para
// a imagem final; um .ttf solto em lib/ não seria levado pelo build standalone.
// Lida uma vez por processo.
let fonteEmCache;
async function carregarFonte() {
  if (!fonteEmCache) {
    const arquivo = await readFile(join(process.cwd(), "public/fontes/Sora-Bold.ttf"));
    fonteEmCache = arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength);
  }
  return fonteEmCache;
}

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const artigo = await buscarArtigoPublicadoPorSlug(slug);
  if (!artigo) return new Response(null, { status: 404 });

  try {
    // arrayBuffer() força a renderização aqui dentro: um erro do Satori
    // (fonte, emoji que não carrega) só apareceria ao ler o corpo, já fora
    // do try, e o compartilhamento ficaria com uma imagem quebrada.
    const png = await new ImageResponse(
      cartaoArtigo({ titulo: artigo.titulo, categoria: artigo.categorias[0]?.nome }),
      {
        width: LARGURA,
        height: ALTURA,
        fonts: [{ name: "Sora", data: await carregarFonte(), weight: 700, style: "normal" }],
      },
    ).arrayBuffer();

    return new Response(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
    });
  } catch {
    return NextResponse.redirect(`${origens().blog}/og-default.png`, 307);
  }
}
