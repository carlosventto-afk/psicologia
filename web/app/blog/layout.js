import Link from "next/link";

export const metadata = {
  title: {
    default: "Blog PsiAgente",
    template: "%s · Blog PsiAgente",
  },
  description: "Artigos sobre psicologia e saúde mental.",
};

export default function LayoutBlog({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="PsiAgente" className="h-8 w-auto" />
            <span className="font-display text-lg font-bold text-navy">PsiAgente</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
