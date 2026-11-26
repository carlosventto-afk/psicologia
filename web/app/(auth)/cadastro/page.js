import CadastroForm from "@/components/CadastroForm";
import { IMAGEM_PADRAO, montarCompartilhamento } from "@/lib/seo";

const TITULO = "Criar conta grátis no PsiAgente";
const DESCRICAO =
  "Crie sua conta gratuita no PsiAgente: agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp para o seu consultório. Sem cartão de crédito.";

export const metadata = {
  title: TITULO,
  description: DESCRICAO,
  // Canonical sem parâmetros: ?origem=home|busca|comparativo é só rastreio
  // de funil, não uma página diferente.
  alternates: { canonical: "/cadastro" },
  // O grupo (auth) é noindex por padrão; o cadastro é a exceção.
  robots: { index: true, follow: true },
  ...montarCompartilhamento({ titulo: TITULO, descricao: DESCRICAO, url: "/cadastro", imagens: [IMAGEM_PADRAO] }),
};

export default async function PaginaCadastro({ searchParams }) {
  const params = await searchParams;
  const origem = ["busca", "comparativo"].includes(params.origem) ? params.origem : null;

  return <CadastroForm origem={origem} />;
}
