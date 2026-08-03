export const metadata = {
  title: "PsiFácil — Sua rotina de consultório em um só lugar",
  description:
    "Agenda, pacientes, financeiro e lembretes automáticos por WhatsApp, tudo em uma ferramenta só. Crie sua conta grátis.",
  openGraph: {
    title: "PsiFácil — Sua rotina de consultório em um só lugar",
    description:
      "Agenda, pacientes, financeiro e lembretes automáticos por WhatsApp, tudo em uma ferramenta só.",
    type: "website",
  },
};

export default function LayoutComece({ children }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
