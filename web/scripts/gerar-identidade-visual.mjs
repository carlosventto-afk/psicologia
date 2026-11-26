// Gera os arquivos fixos de identidade visual usados em SEO e compartilhamento, a partir do mesmo
// desenho que a rota do cartão de cada artigo usa (lib/cartao-og.js) e da fonte Sora Bold
// (public/fontes/Sora-Bold.ttf, licença OFL — ver lib/fontes-arquivos/LICENCAS.md):
//   public/og-default.png  1200x630  imagem padrão de compartilhamento (home, comparativo, busca...)
//   public/logo-512.png    512x512   logotipo do JSON-LD (Organization/publisher)
//   app/apple-icon.png     180x180   ícone de tela inicial do iOS
//   app/favicon.ico        16/32/48  favicon (PNGs dentro do contêiner .ico)
// Rodar a partir de web/:  node scripts/gerar-identidade-visual.mjs
// Fora do Next o ESM puro exige a extensão: "next/og" só resolve dentro do bundler.
import { ImageResponse } from "next/og.js";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ALTURA, LARGURA, cartaoPadrao, iconeQuadrado, iconeRedondo } from "../lib/cartao-og.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arquivoFonte = await readFile(path.join(raiz, "public/fontes/Sora-Bold.ttf"));
const fontes = [
  {
    name: "Sora",
    data: arquivoFonte.buffer.slice(arquivoFonte.byteOffset, arquivoFonte.byteOffset + arquivoFonte.byteLength),
    weight: 700,
    style: "normal",
  },
];

async function png(arvore, largura, altura) {
  const resposta = new ImageResponse(arvore, { width: largura, height: altura, fonts: fontes });
  return Buffer.from(await resposta.arrayBuffer());
}

// Contêiner .ico com PNGs embutidos: aceito por todos os navegadores atuais e pelo Google.
function montarIco(entradas) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo 1 = ícone
  cabecalho.writeUInt16LE(entradas.length, 4);

  let deslocamento = 6 + 16 * entradas.length;
  const diretorio = [];
  const dados = [];
  for (const [lado, imagem] of entradas) {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 0); // largura
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 1); // altura
    entrada.writeUInt8(0, 2); // sem paleta
    entrada.writeUInt8(0, 3); // reservado
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(imagem.length, 8);
    entrada.writeUInt32LE(deslocamento, 12);
    diretorio.push(entrada);
    dados.push(imagem);
    deslocamento += imagem.length;
  }
  return Buffer.concat([cabecalho, ...diretorio, ...dados]);
}

const saidas = [];
async function gravar(relativo, conteudo) {
  await writeFile(path.join(raiz, relativo), conteudo);
  saidas.push(`${relativo} (${conteudo.length} bytes)`);
}

await gravar("public/og-default.png", await png(cartaoPadrao(), LARGURA, ALTURA));
await gravar("public/logo-512.png", await png(iconeRedondo(512), 512, 512));
await gravar("app/apple-icon.png", await png(iconeQuadrado(180), 180, 180));
await gravar(
  "app/favicon.ico",
  montarIco([
    [16, await png(iconeRedondo(16), 16, 16)],
    [32, await png(iconeRedondo(32), 32, 32)],
    [48, await png(iconeRedondo(48), 48, 48)],
  ]),
);

console.log(`Gerados:\n- ${saidas.join("\n- ")}`);
