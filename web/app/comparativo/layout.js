import { sora, inter } from "@/lib/fontes";
import "./comparativo.css";

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
