"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "@/lib/actions/auth";
import LogoPsiAgente from "@/components/LogoPsiAgente";
import { iniciais } from "@/lib/iniciais";
import {
  IconePainel,
  IconeAgenda,
  IconeRecorrencia,
  IconePaciente,
  IconeFinanceiro,
  IconeRecibo,
  IconeConsultorio,
  IconeDiretorio,
  IconeContaUsuario,
  IconeWhatsapp,
  IconeAdmin,
  IconeSair,
  IconeMenu,
  IconeFechar,
  IconeRecolher,
} from "@/components/icons/NavIcons";

const ITENS_NAV = [
  { href: "/", label: "Painel", Icone: IconePainel, exact: true },
  { href: "/agenda", label: "Agenda", Icone: IconeAgenda },
  { href: "/recorrencias", label: "Recorrências", Icone: IconeRecorrencia },
  { href: "/pacientes", label: "Pacientes", Icone: IconePaciente },
  { href: "/financeiro", label: "Financeiro", Icone: IconeFinanceiro },
  { href: "/recibos", label: "Recibos", Icone: IconeRecibo },
  { href: "/consultorios", label: "Consultórios", Icone: IconeConsultorio },
  { href: "/diretorio", label: "Diretório", Icone: IconeDiretorio },
  { href: "/configuracoes/conta", label: "Meus Dados", Icone: IconeContaUsuario },
  { href: "/configuracoes/whatsapp", label: "WhatsApp", Icone: IconeWhatsapp },
];

const CHAVE_RECOLHIDA = "psiagente-sidebar-recolhida";

const ROTULOS_PAPEL = {
  admin: "Administrador",
  psicologo: "Psicólogo(a)",
};

export default function SidebarNav({ ehAdmin, nome, papel, plano }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [recolhida, setRecolhida] = useState(false);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (localStorage.getItem(CHAVE_RECOLHIDA) === "true") setRecolhida(true);
  }, []);

  function alternarRecolhida() {
    setRecolhida((atual) => {
      const novo = !atual;
      localStorage.setItem(CHAVE_RECOLHIDA, String(novo));
      return novo;
    });
  }

  function estaAtivo(href, exact) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const itens =
    plano === "marketing"
      ? ITENS_NAV.filter((item) => item.href === "/diretorio")
      : ehAdmin
        ? [...ITENS_NAV, { href: "/admin/profissionais", label: "Administração", Icone: IconeAdmin }]
        : ITENS_NAV;

  function ListaNav({ compacta, onNavegar }) {
    return (
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {itens.map(({ href, label, Icone, exact }) => {
          const ativo = estaAtivo(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavegar}
              title={compacta ? label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-background ${
                ativo ? "bg-background" : ""
              } ${compacta ? "justify-center" : ""}`}
            >
              <Icone className={ativo ? "shrink-0 text-primary" : "shrink-0 text-muted"} />
              {!compacta && label}
            </Link>
          );
        })}
      </nav>
    );
  }

  function CartaoUsuario({ compacto }) {
    return (
      <div
        className={`flex items-center gap-2.5 px-3 py-2 ${compacto ? "justify-center px-0" : ""}`}
        title={compacto ? nome : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {iniciais(nome)}
        </span>
        {!compacto && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy">{nome}</p>
            <p className="truncate text-xs text-muted">{ROTULOS_PAPEL[papel] ?? papel}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Barra compacta mobile */}
      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <LogoPsiAgente className="h-7 w-auto" />
          <span className="font-display text-base font-bold text-navy">PsiAgente</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-navy hover:bg-background"
        >
          <IconeMenu />
        </button>
      </div>

      {/* Overlay + gaveta mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMenuAberto(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Link
                href="/"
                className="flex items-center gap-2.5"
                onClick={() => setMenuAberto(false)}
              >
                <LogoPsiAgente className="h-8 w-auto" />
                <span className="font-display text-lg font-bold text-navy">PsiAgente</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-1.5 text-muted hover:bg-background"
              >
                <IconeFechar />
              </button>
            </div>

            <ListaNav compacta={false} onNavegar={() => setMenuAberto(false)} />

            <div className="space-y-1 border-t border-border px-3 py-4">
              <CartaoUsuario compacto={false} />
              <form action={sair}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-background"
                >
                  <IconeSair className="shrink-0" />
                  Sair
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar fixa desktop */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-white transition-[width] duration-200 lg:flex lg:flex-col ${
          recolhida ? "lg:w-[76px]" : "lg:w-60"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-5 py-6 ${recolhida ? "justify-center px-0" : ""}`}>
          <Link href="/" className="flex items-center gap-2.5">
            <LogoPsiAgente className="h-9 w-auto" />
            {!recolhida && <span className="font-display text-xl font-bold text-navy">PsiAgente</span>}
          </Link>
        </div>

        <ListaNav compacta={recolhida} />

        <div className="space-y-1 border-t border-border px-3 py-3">
          <CartaoUsuario compacto={recolhida} />
          <form action={sair}>
            <button
              type="submit"
              title={recolhida ? "Sair" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-background ${
                recolhida ? "justify-center" : ""
              }`}
            >
              <IconeSair className="shrink-0" />
              {!recolhida && "Sair"}
            </button>
          </form>

          <button
            type="button"
            onClick={alternarRecolhida}
            aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-background ${
              recolhida ? "justify-center" : ""
            }`}
          >
            <IconeRecolher className={recolhida ? "shrink-0 rotate-180" : "shrink-0"} />
            {!recolhida && "Recolher menu"}
          </button>
        </div>
      </aside>
    </>
  );
}
