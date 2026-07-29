import Link from "next/link";
import { sair } from "@/lib/actions/auth";

export default function LayoutApp({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <nav className="flex items-center gap-6 text-sm font-semibold text-navy">
            <Link href="/">
              <img src="/logo.svg" alt="PsiFácil" className="h-8 w-auto" />
            </Link>
            <Link href="/">Painel</Link>
            <Link href="/agenda">Agenda</Link>
            <Link href="/recorrencias">Recorrências</Link>
            <Link href="/pacientes">Pacientes</Link>
            <Link href="/financeiro">Financeiro</Link>
            <Link href="/recibos">Recibos</Link>
            <Link href="/consultorios">Consultórios</Link>
          </nav>

          <form action={sair}>
            <button type="submit" className="text-sm text-muted">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
