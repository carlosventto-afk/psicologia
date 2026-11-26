import { sora, inter } from "@/lib/fontes";
import { IMAGEM_PADRAO, montarCompartilhamento } from "@/lib/seo";
import "./comece.css";

const TITULO = "PsiAgente — menos trabalho repetitivo, mais paciente";

export const metadata = {
  title: TITULO,
  description:
    "Gestão de consultório com um agente que cuida da parte administrativa: agenda, pacientes, financeiro e lembrete automático de sessão. Crie sua conta gratuita.",
  // Página de campanha paga: repete a proposta da home e não deve disputar
  // com ela nos resultados de busca. Fica fora do índice (o proxy manda o
  // mesmo noindex no cabeçalho X-Robots-Tag), mas continua compartilhável.
  robots: { index: false, follow: true },
  ...montarCompartilhamento({
    titulo: TITULO,
    descricao:
      "Gestão de consultório com um agente que cuida da parte administrativa: agenda, pacientes, financeiro e lembrete automático de sessão.",
    imagens: [IMAGEM_PADRAO],
  }),
};

export default function LayoutComece({ children }) {
  return (
    <div className={`${sora.variable} ${inter.variable} comece`}>{children}</div>
  );
}
