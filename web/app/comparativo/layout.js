import { Sora, Inter } from "next/font/google";
import "./comparativo.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const TITULO = "Carnê-Leão ou Simples Nacional? Compare quanto sobra para você";
const DESCRICAO =
  "Simulador gratuito para psicólogos: informe seu faturamento e despesas e veja, lado a lado, o líquido como pessoa física (Carnê-Leão) e como pessoa jurídica (Simples Nacional).";

export const metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/comparativo" },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: "website",
    url: "/comparativo",
  },
};

export default function LayoutComparativo({ children }) {
  return <div className={`${sora.variable} ${inter.variable} cmp`}>{children}</div>;
}
