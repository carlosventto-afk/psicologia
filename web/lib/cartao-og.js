// Cartões de compartilhamento (Open Graph) e ícones da marca. Descritos como
// árvores de elementos simples ({ type, props }) em vez de JSX, para que o
// mesmo desenho sirva à rota que gera o cartão de cada artigo (Next/ImageResponse)
// e ao script que gera os arquivos fixos (scripts/gerar-identidade-visual.mjs).
// Paleta do brand book v1: petróleo, marfim e âmbar; a menta só existe dentro
// do logotipo (ponto do símbolo).

export const LARGURA = 1200;
export const ALTURA = 630;

export const CORES = {
  petroleo: "#17514E",
  marfim: "#F8F6F1",
  ambar: "#E0913F",
  menta: "#6FCBB6",
};

function el(tipo, estilo, ...filhos) {
  const validos = filhos.flat().filter((f) => f !== null && f !== undefined && f !== false);
  return {
    type: tipo,
    props: {
      style: { display: "flex", ...estilo },
      children: validos.length === 1 ? validos[0] : validos,
    },
  };
}

function imagem(src, largura, altura) {
  return { type: "img", props: { src, width: largura, height: altura } };
}

function svgParaDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const TRACOS = (cor) =>
  `<g fill="none" stroke="${cor}" stroke-width="3.4" stroke-linecap="round">` +
  `<path d="M24 38 V26.4"/><path d="M24 26.4 V10"/>` +
  `<path d="M24 26.4C24 26.4 13.6 25.3 13.6 10.8"/>` +
  `<path d="M24 26.4C24 26.4 32 25.4 32.6 15.6"/></g>`;

// Só o símbolo (sem o círculo), enquadrado num quadrado: para fundo escuro.
export function marcaDataUri(corTraco = CORES.marfim) {
  return svgParaDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 6 36 36">${TRACOS(corTraco)}` +
      `<circle cx="33.3" cy="12.6" r="2.7" fill="${CORES.menta}"/></svg>`,
  );
}

// Mesmo desenho de app/icon.svg: círculo petróleo com o símbolo.
export function iconeRedondoDataUri() {
  return svgParaDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` +
      `<circle cx="24" cy="24" r="22" fill="${CORES.petroleo}"/>${TRACOS(CORES.marfim)}` +
      `<circle cx="33.3" cy="12.6" r="2.7" fill="${CORES.menta}"/></svg>`,
  );
}

export function limitarTitulo(titulo, max = 150) {
  const texto = String(titulo ?? "").replace(/\s+/g, " ").trim();
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > max * 0.5 ? corte.slice(0, ultimoEspaco) : corte;
  return `${base.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

// Título maior em frase curta, menor em frase longa — sempre cabendo em até
// quatro linhas no cartão.
export function tamanhoDoTitulo(titulo) {
  const n = String(titulo ?? "").length;
  if (n <= 45) return 78;
  if (n <= 70) return 68;
  if (n <= 100) return 58;
  if (n <= 130) return 50;
  return 44;
}

const DOMINIO_BLOG = "blog.psiagente.com.br";

// Cartão de um artigo do blog: título grande sobre fundo petróleo.
export function cartaoArtigo({ titulo, categoria }) {
  const texto = limitarTitulo(titulo);
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "space-between",
      background: CORES.petroleo,
      color: CORES.marfim,
      padding: "72px 80px",
      fontFamily: "Sora",
    },
    el(
      "div",
      { alignItems: "center" },
      imagem(marcaDataUri(), 64, 64),
      el("div", { marginLeft: 20, fontSize: 38, fontWeight: 700 }, "PsiAgente"),
    ),
    el(
      "div",
      { flexDirection: "column" },
      el(
        "div",
        { fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: CORES.ambar, marginBottom: 28 },
        categoria || "Blog",
      ),
      el("div", { fontSize: tamanhoDoTitulo(texto), fontWeight: 700, lineHeight: 1.15 }, texto),
    ),
    el(
      "div",
      { alignItems: "center" },
      el("div", { width: 96, height: 8, borderRadius: 4, background: CORES.ambar }),
      el("div", { marginLeft: 24, fontSize: 28, fontWeight: 700, opacity: 0.8 }, DOMINIO_BLOG),
    ),
  );
}

// Imagem padrão de compartilhamento (public/og-default.png).
export function cartaoPadrao() {
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "center",
      background: CORES.petroleo,
      color: CORES.marfim,
      padding: "0 96px",
      fontFamily: "Sora",
    },
    el(
      "div",
      { alignItems: "center" },
      imagem(marcaDataUri(), 150, 150),
      el("div", { marginLeft: 36, fontSize: 112, fontWeight: 700 }, "PsiAgente"),
    ),
    el("div", { marginTop: 44, fontSize: 46, fontWeight: 700, opacity: 0.85 }, "Gestão de consultório para psicólogos"),
    el("div", { marginTop: 40, width: 120, height: 10, borderRadius: 5, background: CORES.ambar }),
  );
}

// Ícone redondo (favicon e logo do JSON-LD): fundo transparente.
export function iconeRedondo(lado) {
  return el("div", { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }, imagem(iconeRedondoDataUri(), lado, lado));
}

// Ícone quadrado de página inicial do iOS (apple-touch-icon): sem transparência,
// o sistema arredonda os cantos.
export function iconeQuadrado(lado) {
  return el(
    "div",
    { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: CORES.petroleo },
    imagem(marcaDataUri(), Math.round(lado * 0.64), Math.round(lado * 0.64)),
  );
}
