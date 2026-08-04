import { Fraunces, Nunito } from "next/font/google";
import "./comece.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "PsiFácil — a parte administrativa do consultório, fora do seu caminho",
  description:
    "Agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp, tudo em um só lugar. Crie sua conta gratuita.",
  openGraph: {
    title: "PsiFácil — a parte administrativa do consultório, fora do seu caminho",
    description:
      "Agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp, tudo em um só lugar.",
    type: "website",
  },
};

export default function LayoutComece({ children }) {
  return (
    <div className={`${fraunces.variable} ${nunito.variable} comece`}>{children}</div>
  );
}
