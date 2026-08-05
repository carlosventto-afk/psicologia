import { Sora, Inter } from "next/font/google";
import "./comece.css";

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

export const metadata = {
  title: "PsiAgente — menos trabalho repetitivo, mais paciente",
  description:
    "Gestão de consultório com um agente que cuida da parte administrativa: agenda, pacientes, financeiro e lembrete automático de sessão. Crie sua conta gratuita.",
  openGraph: {
    title: "PsiAgente — menos trabalho repetitivo, mais paciente",
    description:
      "Gestão de consultório com um agente que cuida da parte administrativa: agenda, pacientes, financeiro e lembrete automático de sessão.",
    type: "website",
  },
};

export default function LayoutComece({ children }) {
  return (
    <div className={`${sora.variable} ${inter.variable} comece`}>{children}</div>
  );
}
