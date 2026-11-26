import localFont from "next/font/local";

// Fontes das páginas públicas (/comparativo e /comece), hospedadas no repositório (lib/fontes-arquivos).
//
// Antes vinham de next/font/google, que baixa as fontes do Google a cada build. O Google às vezes
// responde com URLs de arquivo com query (?kit=...&skey=...) e o Turbopack do Next 16 derruba o build
// com "next/font/google queries have exactly one entry" (deploy de 2026-11-25). Com arquivo local o
// build não depende de rede e sai sempre igual.
//
// Os arquivos são o subconjunto latin das fontes variáveis do Google Fonts (a mesma coisa que o
// next/font/google servia). As faixas de peso são as que as páginas já declaravam (Sora 600-700,
// Inter 400-600), para a renderização continuar idêntica. Licenças em lib/fontes-arquivos/LICENCAS.md.
export const sora = localFont({
  src: "./fontes-arquivos/sora-latin.woff2",
  weight: "600 700",
  variable: "--font-display",
  display: "swap",
});

export const inter = localFont({
  src: "./fontes-arquivos/inter-latin.woff2",
  weight: "400 600",
  variable: "--font-body",
  display: "swap",
});
