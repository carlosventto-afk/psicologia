"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sair } from "@/lib/actions/auth";
import {
  IconePainel,
  IconeAgenda,
  IconeRecorrencia,
  IconePaciente,
  IconeFinanceiro,
  IconeRecibo,
  IconeConsultorio,
  IconeDiretorio,
  IconeWhatsapp,
  IconeAdmin,
  IconeSair,
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
  { href: "/configuracoes/whatsapp", label: "WhatsApp", Icone: IconeWhatsapp },
];

export default function SidebarNav({ ehAdmin }) {
  const pathname = usePathname();

  function estaAtivo(href, exact) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const itens = ehAdmin
    ? [...ITENS_NAV, { href: "/admin/profissionais", label: "Administração", Icone: IconeAdmin }]
    : ITENS_NAV;

  return (
    <aside className="border-b border-border bg-white lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="px-5 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="PsiAgente" className="h-9 w-auto" />
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 px-3 pb-4 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {itens.map(({ href, label, Icone, exact }) => {
          const ativo = estaAtivo(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-background ${
                ativo ? "bg-background" : ""
              }`}
            >
              <Icone className={ativo ? "shrink-0 text-primary" : "shrink-0 text-muted"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-4">
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
  );
}
