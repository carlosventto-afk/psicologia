import Link from "next/link";
import { DESCRICAO_BLOG, alternativasBlog, origens } from "@/lib/seo";

export const metadata = {
  // O blog vive em blog.psiagente.com.br: endereços relativos de canonical,
  // Open Graph e feed daqui para baixo resolvem contra o host do blog.
  metadataBase: new URL(origens().blog),
  title: {
    default: "Blog PsiAgente",
    template: "%s · Blog PsiAgente",
  },
  description: DESCRICAO_BLOG,
  // Feed RSS em todas as páginas do blog. Cada página que define o próprio
  // `alternates` (canonical) o refaz com alternativasBlog.
  alternates: alternativasBlog(),
};

export default function LayoutBlog({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link href="/">
            <img src="/logo.svg" alt="PsiAgente" className="h-8 w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
