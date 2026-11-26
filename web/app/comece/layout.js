import { sora, inter } from "@/lib/fontes";
import "./comece.css";

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
