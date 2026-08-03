import Link from "next/link";

export const metadata = {
  title: {
    default: "Blog PsiFácil",
    template: "%s · Blog PsiFácil",
  },
  description: "Artigos sobre psicologia e saúde mental.",
};

export default function LayoutBlog({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link href="/">
            <img src="/logo.svg" alt="PsiFácil" className="h-8 w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
