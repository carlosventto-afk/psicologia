"use client";

import { useState } from "react";
import Link from "next/link";
import LogoPsiAgente from "./LogoPsiAgente";
import { IconeMenu, IconeFechar } from "./icons/NavIcons";

const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL ?? "https://blog.psiagente.com.br";

const LINKS_NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#precos", label: "Preços" },
  { href: BLOG_URL, label: "Blog" },
];

export default function HeaderInstitucional() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoPsiAgente className="h-8 w-auto" />
          <span className="font-display text-lg font-bold text-navy">PsiAgente</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS_NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-navy hover:text-primary-dark transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="btn-outline">
            Entrar
          </Link>
          <Link href="/cadastro?origem=home" className="btn-primary">
            Criar conta grátis
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          className="md:hidden text-navy p-2 -mr-2"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
        >
          {menuAberto ? <IconeFechar width={24} height={24} /> : <IconeMenu width={24} height={24} />}
        </button>
      </div>

      {menuAberto && (
        <div className="md:hidden border-t border-border bg-surface px-4 py-4">
          <nav className="flex flex-col gap-3">
            {LINKS_NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuAberto(false)}
                className="text-sm font-semibold text-navy"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/login" className="btn-outline w-full" onClick={() => setMenuAberto(false)}>
              Entrar
            </Link>
            <Link
              href="/cadastro?origem=home"
              className="btn-primary w-full"
              onClick={() => setMenuAberto(false)}
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
