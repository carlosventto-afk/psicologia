import { DESCRICAO_BUSCA, origens } from "@/lib/seo";

export const metadata = {
  // O diretório vive em busca.psiagente.com.br: endereços relativos de
  // canonical e Open Graph daqui para baixo resolvem contra o host da busca.
  metadataBase: new URL(origens().busca),
  title: {
    default: "Encontre um psicólogo | PsiAgente",
    template: "%s | Encontre um psicólogo",
  },
  description: DESCRICAO_BUSCA,
};

export default function LayoutBusca({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <a href="/">
            <img src="/logo.svg" alt="PsiAgente" className="h-8 w-auto" />
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
