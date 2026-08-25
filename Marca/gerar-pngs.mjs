// Script de uso único: gera PNGs em alta resolução a partir dos SVGs em Marca/svg/.
// Rodar de dentro de web/ (onde a dependência "sharp" está instalada):
//   node ../Marca/gerar-pngs.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const svgDir = path.resolve("../Marca/svg");
const pngDir = path.resolve("../Marca/png");
fs.mkdirSync(pngDir, { recursive: true });

const arquivos = fs.readdirSync(svgDir).filter((f) => f.endsWith(".svg"));

for (const arquivo of arquivos) {
  const svgPath = path.join(svgDir, arquivo);
  const nomeBase = arquivo.replace(/\.svg$/, "");
  const svg = fs.readFileSync(svgPath, "utf8");
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const [vw, vh] = viewBoxMatch ? [parseFloat(viewBoxMatch[1]), parseFloat(viewBoxMatch[2])] : [212, 48];
  const larguraAlvo = vw > vh * 2 ? 2400 : 2000; // lockups (mais largos que altos) vs. ícones/favicon quadrados
  const alturaAlvo = Math.round((vh / vw) * larguraAlvo);

  const destino = path.join(pngDir, `${nomeBase}@alta-resolucao.png`);
  await sharp(Buffer.from(svg), { density: 600 })
    .resize(larguraAlvo, alturaAlvo, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(destino);
  console.log(`${arquivo} -> ${path.basename(destino)} (${larguraAlvo}x${alturaAlvo})`);
}

console.log(`\n${arquivos.length} PNGs gerados em ${pngDir}`);
